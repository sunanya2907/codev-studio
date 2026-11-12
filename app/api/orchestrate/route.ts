import { NextResponse } from "next/server";
import { reportError } from "@/lib/debug-agent";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { BUILD_COST, CUSTOMIZE_COST, STANDARD_PRICE_LABEL } from "@/lib/plans";
import { getBillingState, reserveTokens, refundTokens } from "@/lib/tokens";
import { normalizeFiles } from "@/lib/files";
import { failBuild, reconcileStaleBuilds } from "@/lib/builds";
import { runStaticChecks } from "@/lib/checks";
import { validateBackend, validateFrontend, validateSchema, validateSrs } from "@/lib/validate";
import { isHealthcareIdea } from "@/lib/healthcare";
import { addTrackingBackendFiles, addTrackingFrontendFiles, isTrackingIdea } from "@/lib/tracking";
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

// The AI provider (Gemini only) lives in lib/ai.ts.
// The model name is env-configurable there (GEMINI_MODEL).

const MAX_PROMPT_LENGTH = 1500; // idea (max 500 in the editor) + the answers to the 3 questions
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
    // On Vercel the function is killed at maxDuration, so stop early there. On localhost there is no such limit,
    // so give the whole 5-agent build 20 minutes (a full build here takes ~5 minutes).
    const deadline = Date.now() + (process.env.VERCEL ? (maxDuration - 15) * 1000 : 20 * 60 * 1000);
    const providersUsed: string[] = [];

    const callAI = async (systemPrompt: string) => {
      // Gemini only; temporary errors are retried inside lib/ai.ts.
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
              `Free Plan only includes the Live Preview. Upgrade to Standard (${STANDARD_PRICE_LABEL}) to view, edit and export the code!`,
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

    // CASE 2: Full app build (costs 1 token). Streams live progress, and is stored in the
    // database from the first second, so closing the tab can never lose a build or a token.
    if (!prompt) {
      return NextResponse.json({ error: "Please describe the app you want to build." }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).` },
        { status: 413 }
      );
    }

    const userId = session.user.id;
    await reconcileStaleBuilds(userId); // returns tokens of builds that were killed earlier

    const running = await db.generationHistory.count({ where: { userId, status: "BUILDING" } });
    if (running > 0) {
      return NextResponse.json(
        { error: "You already have a build running. Wait for it to finish (it also appears in History)." },
        { status: 409 }
      );
    }

    // Reserve the token atomically BEFORE the expensive work.
    const balanceAfterReserve = await reserveTokens(userId, BUILD_COST);
    if (balanceAfterReserve === null) return outOfTokens(BUILD_COST);

    let buildId: string;
    try {
      const row = await db.generationHistory.create({
        data: { userId, prompt, spec: "", frontend: "", backend: "", database: "", qa: "", status: "BUILDING" },
        select: { id: true },
      });
      buildId = row.id;
    } catch (e) {
      await refundTokens(userId, BUILD_COST);
      throw e;
    }

    const isFree = user.tier === "FREE";
    const healthcare = isHealthcareIdea(prompt); // doctor / patient apps get privacy + role rules
    const tracking = isTrackingIdea(prompt); // GPS / live-tracking apps get extra rules + a ready-made map
    const enc = new TextEncoder();
    let clientConnected = true;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: Record<string, unknown>) => {
          if (!clientConnected) return;
          try {
            controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
          } catch {
            clientConnected = false; // the user left; the build carries on and is saved
          }
        };
        const event = (agent: AgentKey, status: "start" | "retry" | "done") =>
          send({ type: "agent", agent, status });
        const warnings: string[] = [];

        // One agent: run, check the answer, ask once more if it is broken.
        const runAgent = async (
          key: AgentKey,
          basePrompt: string,
          clean: (t: string) => string,
          validate: (t: string) => string[]
        ): Promise<string> => {
          event(key, "start");
          let text = clean(await callAI(basePrompt));
          let issues = validate(text);
          if (issues.length) {
            event(key, "retry");
            const second = clean(
              await callAI(
                `${basePrompt}\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS. Fix all of them and return the COMPLETE corrected answer in the required format:\n- ${issues.join("\n- ")}`
              )
            );
            const issues2 = validate(second);
            if (issues2.length <= issues.length) {
              text = second;
              issues = issues2;
            }
          }
          if (issues.some((i) => /^No |defines no models|no datasource|far too short/.test(i)) || !text.trim()) {
            throw new Error(`Agent ${AGENT_KEYS.indexOf(key) + 1} could not produce a usable result (${issues[0] || "empty answer"}). Please try again.`);
          }
          issues.forEach((i) => warnings.push(`Agent ${AGENT_KEYS.indexOf(key) + 1}: ${i}`));
          event(key, "done");
          return text;
        };

        try {
          const LOCKED = `// Locked on Free Plan. Upgrade to Standard (${STANDARD_PRICE_LABEL}) to view, edit and export the code.`;
          let frontend = LOCKED;
          let backend = LOCKED;
          let database = LOCKED;
          let qa = `# Locked on Free Plan\nUpgrade to Standard (${STANDARD_PRICE_LABEL}) or higher to unlock the code and the QA report.`;

          // Agent 1: the SRS (its data model / API / pages sections are the contract for 2, 3, 4)
          const spec = await runAgent("spec", srsPrompt(prompt, tracking, healthcare), (t) => t, validateSrs);

          const frontendRun = () =>
            runAgent("frontend", frontendPrompt(spec, tracking, healthcare), (t) => normalizeFiles(t, "app/page.tsx"), validateFrontend);

          if (isFree) {
            frontend = await frontendRun(); // free builds only need the UI for the Live Preview
            if (tracking) frontend = addTrackingFrontendFiles(frontend);
          } else {
            // Agents 2, 3, 4 in parallel, all from the same SRS contract
            [frontend, backend, database] = await Promise.all([
              frontendRun(),
              runAgent("backend", backendPrompt(spec, tracking, healthcare), (t) => normalizeFiles(t, "app/api/route.ts"), validateBackend),
              runAgent("database", databasePrompt(spec, tracking, healthcare), (t) => t, validateSchema),
            ]);
            if (tracking) {
              frontend = addTrackingFrontendFiles(frontend);
              backend = addTrackingBackendFiles(backend);
            }
            // Agent 5 reviews the REAL code; code-level checks are added as facts
            event("qa", "start");
            qa = await callAI(qaPrompt(spec, frontend, backend, database, tracking, healthcare));
            const checks = runStaticChecks(spec, frontend, backend, database);
            const warn = warnings.length
              ? `\n\n---\n## Output warnings\nThe agents' answers passed with these small problems:\n${warnings.map((w) => `- ${w}`).join("\n")}\n`
              : "";
            qa = `${qa.trim()}${warn}${checks.markdown}`;
            event("qa", "done");
          }

          await db.generationHistory.update({
            where: { id: buildId },
            data: { spec, frontend, backend, database, qa, status: "DONE", error: null },
          });

          send({
            type: "done",
            spec: isFree ? LOCKED : spec,
            frontend,
            backend,
            database,
            qa,
            historyId: buildId,
            tier: user.tier,
            tokenBalance: balanceAfterReserve,
            aiProviders: providersUsed,
          });
        } catch (genError) {
          console.error("BUILD FAILED:", genError, genError instanceof AiUnavailableError ? genError.reason : "");
          void reportError(genError, { source: "server", route: "/api/orchestrate", method: "POST" });
          const message =
            genError instanceof AiUnavailableError
              ? `${genError.message} Your token was returned.`
              : `${genError instanceof Error && genError.message ? genError.message : "The build failed."} Your token was returned.`;
          await failBuild(userId, buildId, message); // flips the row and refunds, once
          send({ type: "error", error: message });
        } finally {
          try {
            controller.close();
          } catch {}
        }
      },
      cancel() {
        clientConnected = false; // tab closed: keep building, the result lands in History
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("ORCHESTRATE ERROR:", error);
    void reportError(error, { source: "server", route: "/api/orchestrate", method: "POST" });
    const message =
      error instanceof AiUnavailableError
        ? `${error.message} Your token was not charged.`
        : error instanceof Error && error.message
        ? error.message
        : "Failed to orchestrate agents.";
    return NextResponse.json({ error: message }, { status: error instanceof AiUnavailableError ? 503 : 500 });
  }
}