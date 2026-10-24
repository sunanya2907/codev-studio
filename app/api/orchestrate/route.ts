import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { BUILD_COST, CUSTOMIZE_COST } from "@/lib/plans";
import { getBillingState, reserveTokens, refundTokens } from "@/lib/tokens";

// A full build makes 5 Gemini calls (1, then 4 in parallel). That easily exceeds
// the default serverless timeout on Vercel and shows up as a 504 / "Unexpected token '<'".
export const maxDuration = 60;

// Google retires Gemini model names regularly (2.5-flash is closed to new users).
// Override without a code change by setting GEMINI_MODEL in Vercel / .env.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

const MAX_PROMPT_LENGTH = 500; // matches the "x/500" counter in the editor
const MAX_INSTRUCTION_LENGTH = 1000;
const MAX_CODE_LENGTH = 60000;

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

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing." },
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const callGemini = async (systemPrompt: string) => {
      const result = await model.generateContent(systemPrompt);
      let text = result.response.text()?.trim();
      if (!text) throw new Error("Gemini returned an empty response.");

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

      // Free users may only customize Agent 1 (spec)
      if (user.tier === "FREE" && agent !== "spec") {
        return NextResponse.json(
          {
            error:
              "Free Plan only allows Agent 1 (Architect Spec). Upgrade to Standard ($9) to unlock all agents!",
            code: "PLAN_LOCKED",
          },
          { status: 403 }
        );
      }

      // Customizing is a paid Gemini call, so it costs tokens just like a build.
      // Reserve first (atomic), refund if Gemini fails.
      const balanceAfterReserve = await reserveTokens(session.user.id, CUSTOMIZE_COST);
      if (balanceAfterReserve === null) return outOfTokens(CUSTOMIZE_COST);

      try {
        const customPrompt = `You are a senior full-stack AI agent updating the "${agent}" module.\nCurrent Code/Spec:\n${currentCode}\n\nUser Instruction: ${instruction}\n\nReturn ONLY the updated code or markdown without explanations.`;
        const updatedCode = await callGemini(customPrompt);

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
      // Agent 1 (Architect Spec) runs on every plan
      const spec = await callGemini(
        `Act as Agent 1 (System Architect). Create a clean, structured Markdown Architecture Specification (Tech stack, core features, API endpoints, database models) for this web app idea:\n"${prompt}"`
      );

      let frontend =
        "// Locked on Free Plan. Upgrade to Standard ($9 / 10 Tokens) to unlock Agent 2 Frontend UI.";
      let backend =
        "// Locked on Free Plan. Upgrade to Standard ($9 / 10 Tokens) to unlock Agent 3 Backend API.";
      let database =
        "// Locked on Free Plan. Upgrade to Standard ($9 / 10 Tokens) to unlock Agent 4 Database Schema.";
      let qa =
        "# Locked on Free Plan\nUpgrade to Standard ($9), Pro ($49), or Exclusive Plan to unlock Agent 5 Security & Deployment QA.";

      // Agents 2-5 only for paid plans
      if (user.tier !== "FREE") {
        [frontend, backend, database, qa] = await Promise.all([
          callGemini(
            `Act as Agent 2 (Frontend UI Engineer). Based on this spec:\n${spec}\nWrite a complete, single-file Next.js 15 + Tailwind CSS client component (app/page.tsx) with modern dark UI and interactive state. Return ONLY valid TypeScript/React code.`
          ),
          callGemini(
            `Act as Agent 3 (Backend API Engineer). Based on this spec:\n${spec}\nWrite a Next.js App Router API route (app/api/route.ts) with GET and POST handlers using Prisma. Return ONLY valid TypeScript code.`
          ),
          callGemini(
            `Act as Agent 4 (Database Architect). Based on this spec:\n${spec}\nWrite a clean Prisma schema (schema.prisma) for PostgreSQL. Return ONLY valid Prisma schema code.`
          ),
          callGemini(
            `Act as Agent 5 (Security & Deployment QA). Based on this spec:\n${spec}\nProvide a concise Markdown security audit and Vercel deployment checklist.`
          ),
        ]);
      }

      // Saved before responding, so the build is never lost to a refresh.
      const saved = await db.generationHistory.create({
        data: { userId: session.user.id, prompt, spec, frontend, backend, database, qa },
        select: { id: true },
      });

      return NextResponse.json({
        spec,
        frontend,
        backend,
        database,
        qa,
        historyId: saved.id,
        tier: user.tier,
        tokenBalance: balanceAfterReserve,
      });
    } catch (genError) {
      // The build failed, so give the reserved token back.
      await refundTokens(session.user.id, BUILD_COST);
      throw genError;
    }
  } catch (error: unknown) {
    console.error("ORCHESTRATE ERROR:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to orchestrate agents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}