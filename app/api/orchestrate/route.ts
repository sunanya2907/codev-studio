import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { BUILD_COST, CUSTOMIZE_COST } from "@/lib/plans";
import { getBillingState, reserveTokens, refundTokens } from "@/lib/tokens";
import { normalizeFiles } from "@/lib/files";
import { AiNotConfiguredError, AiUnavailableError, aiConfigured, generateText } from "@/lib/ai";
import {
  srsPrompt,
  frontendPrompt,
  backendPrompt,
  databasePrompt,
  qaPrompt,
  customizeHint,
} from "@/lib/agents";

// A full build makes several AI calls (1, then 4 in parallel). That easily exceeds
// the default serverless timeout on Vercel and shows up as a 504 / "Unexpected token '<'".
// The build is now 3 steps (SRS -> frontend/backend/database in parallel -> QA review) and
// the output is much bigger. If Vercel rejects 300 on your plan, lower this to 60.
export const maxDuration = 300;

// AI providers (Gemini, Claude, GPT, DeepSeek) and their fail-over order live in lib/ai.ts.
// Model names are env-configurable there (GEMINI_MODEL, ANTHROPIC_MODEL, ...).

const MAX_PROMPT_LENGTH = 500; // matches the "x/500" counter in the editor
const MAX_INSTRUCTION_LENGTH = 1000;
const MAX_CODE_LENGTH = 150000; // multi-file modules are bigger than the old single files

const AGENT_KEYS = ["spec", "frontend", "backend", "database", "qa"] as const;
type AgentKey = (typeof AGENT_KEYS)[number];

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Please sign in to generate apps." },
        { status: 401 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const agent = typeof body.agent === "string" ? body.agent : undefined;
    const currentCode = typeof body.currentCode === "string" ? body.currentCode : "";
    const historyId = typeof body.historyId === "string" ? body.historyId : "";
    const instruction =
      typeof body.instruction === "string" ? body.instruction.trim() : "";

    if (!aiConfigured()) {
      return NextResponse.json(
        { error: new AiNotConfiguredError().message },
        { status: 500 }
      );
    }

    // Also applies the monthly token refill if this user's period has ended.
    const user = await getBillingState(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const outOfTokens = (cost: number) =>
      NextResponse.json(
        {
          error: `You have used all your plan tokens! This action costs ${cost} token${cost === 1 ? "" : "s"}. Buy extra tokens for $1 each or upgrade your plan.`,
          code: "OUT_OF_TOKENS",
        },
        { status: 402 }
      );

    // Stop starting new provider attempts shortly before Vercel kills the function.
    const deadline = Date.now() + (maxDuration - 15) * 1000;
    const providersUsed: string[] = [];

    const callAI = async (systemPrompt: string) => {
      // Tries Gemini first, then Claude / GPT / DeepSeek if it is down (see lib/ai.ts).
      const result = await generateText(systemPrompt, { deadline });
      if (!providersUsed.includes(result.provider)) providersUsed.push(result.provider);
      let text = result.text.trim();

      // Models often wrap the whole answer in ONE ```lang fence. Remove only that
      // outer wrapper. (The old code stripped every fence, which destroyed the code
      // blocks inside the Markdown spec.)
      const fenceCount = (text.match(/```/g) || []).length;
      if (fenceCount === 2 && text.startsWith("```") && text.endsWith("```")) {
        text = text
          .replace(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n?/, "")
          .replace(/\r?\n?```$/, "")
          .trim();
      }
      return text;
    };

    // CASE 1: Single-agent customization ("Customize Spec", "Customize UI", ...)
    if (agent && instruction) {
      if (!AGENT_KEYS.includes(agent as AgentKey)) {
        return NextResponse.json({ error: "Unknown agent." }, { status: 400 });
      }
      if (
        instruction.length > MAX_INSTRUCTION_LENGTH ||
        currentCode.length > MAX_CODE_LENGTH
      ) {
        return NextResponse.json(
          { error: "Instruction or code is too long." },
          { status: 413 }
        );
      }

      // Free users can only preview; code (and editing it) is a paid feature
      if (user.tier === "FREE") {
        return NextResponse.json(
          {
            error:
              "Free Plan only includes the Live Preview. Upgrade to Standard ($9) to view, edit and export the code!",
            code: "PLAN_LOCKED",
          },
          { status: 403 }
        );
      }

      // Customizing is a paid AI call, so it costs tokens just like a build.
      // Reserve first (atomic), refund if every AI provider fails.
      const balanceAfterReserve = await reserveTokens(session.user.id, CUSTOMIZE_COST);
      if (balanceAfterReserve === null) return outOfTokens(CUSTOMIZE_COST);

      try {
        const customPrompt = `You are a senior full-stack AI agent updating the "${agent}" module.\n${customizeHint(agent)}\n\nCurrent Code/Spec:\n${currentCode}\n\nUser Instruction: ${instruction}\n\nReturn ONLY the updated code or markdown without explanations.`;
        let updatedCode = await callAI(customPrompt);
        if (agent === "frontend") updatedCode = normalizeFiles(updatedCode, "app/page.tsx");
        if (agent === "backend") updatedCode = normalizeFiles(updatedCode, "app/api/route.ts");

        // Persist the edit so it survives a refresh / closing the tab.
        if (historyId) {
          await db.generationHistory
            .updateMany({
              where: { id: historyId, userId: session.user.id }, // ownership check
              data: { [agent]: updatedCode },
            })
            .catch((e: unknown) => console.error("HISTORY UPDATE FAILED:", e));
        }

        return NextResponse.json({
          updatedCode,
          tier: user.tier,
          tokenBalance: balanceAfterReserve,
          aiProviders: providersUsed,
        });
      } catch (genError) {
        await refundTokens(session.user.id, CUSTOMIZE_COST);
        throw genError;
      }
    }

    // CASE 2: Full app build (costs 1 token)
    if (!prompt) {
      return NextResponse.json(
        { error: "Please describe the app you want to build." },
        { status: 400 }
      );
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).` },
        { status: 413 }
      );
    }

    // Reserve the token atomically BEFORE doing the expensive work, so two
    // simultaneous requests can't both spend the last token.
    const balanceAfterReserve = await reserveTokens(session.user.id, BUILD_COST);
    if (balanceAfterReserve === null) return outOfTokens(BUILD_COST);

    try {
      // Agent 1 writes the SRS, whose data model / API / pages sections are the contract
      // that Agents 2, 3 and 4 all build from.
      const spec = await callAI(srsPrompt(prompt));

      const LOCKED = "// Locked on Free Plan. Upgrade to Standard ($9 / 10 Tokens) to view, edit and export the code.";
      let frontend = LOCKED;
      let backend = LOCKED;
      let database = LOCKED;
      let qa = "# Locked on Free Plan\nUpgrade to Standard ($9), Pro ($49), or Exclusive to unlock the code and the QA report.";

      const buildFrontend = async () =>
        normalizeFiles(await callAI(frontendPrompt(spec)), "app/page.tsx");

      if (user.tier === "FREE") {
        // Free builds only need the UI so the Live Preview can run.
        frontend = await buildFrontend();
      } else {
        // Agents 2, 3, 4 run in parallel from the same SRS contract...
        [frontend, backend, database] = await Promise.all([
          buildFrontend(),
          callAI(backendPrompt(spec)).then((t) => normalizeFiles(t, "app/api/route.ts")),
          callAI(databasePrompt(spec)),
        ]);
        // ...then Agent 5 reviews the REAL code they produced.
        qa = await callAI(qaPrompt(spec, frontend, backend, database));
      }

      // Saved before responding, so the build is never lost to a refresh.
      const saved = await db.generationHistory.create({
        data: { userId: session.user.id, prompt, spec, frontend, backend, database, qa },
        select: { id: true },
      });

      return NextResponse.json({
        spec: user.tier === "FREE" ? LOCKED : spec,
        frontend,
        backend,
        database,
        qa,
        historyId: saved.id,
        tier: user.tier,
        tokenBalance: balanceAfterReserve,
        aiProviders: providersUsed,
      });
    } catch (genError) {
      // The build failed, so give the reserved token back.
      await refundTokens(session.user.id, BUILD_COST);
      throw genError;
    }
  } catch (error: unknown) {
    console.error("ORCHESTRATE ERROR:", error);
    const message =
      error instanceof AiUnavailableError
        ? `${error.message} Your token was not charged.`
        : error instanceof Error && error.message
        ? error.message
        : "Failed to orchestrate agents.";
    return NextResponse.json({ error: message }, { status: error instanceof AiUnavailableError ? 503 : 500 });
  }
}
