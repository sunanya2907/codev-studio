import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/auth";
import { db } from "../../../lib/db";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Please sign in to generate apps." },
        { status: 401 }
      );
    }

    const { prompt, agent, currentCode, instruction } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing." },
        { status: 500 }
      );
    }

    // Fetch User Tier & Token Balance from Database
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, tier: true, tokenBalance: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const callGemini = async (systemPrompt: string) => {
      const result = await model.generateContent(systemPrompt);
      const text = result.response.text();
      if (!text) throw new Error("Gemini returned an empty response.");
      return text.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "").trim();
    };

    // CASE 1: Single-Agent Customization ("Customize Spec", "Customize UI", etc.)
    if (agent && instruction) {
      // Block Free users from customizing Agents 2, 3, 4, 5
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

      const customPrompt = `You are a senior full-stack AI agent updating the "${agent}" module.\nCurrent Code/Spec:\n${currentCode}\n\nUser Instruction: ${instruction}\n\nReturn ONLY the updated code or markdown without explanations.`;
      const updatedCode = await callGemini(customPrompt);

      return NextResponse.json({
        updatedCode,
        tier: user.tier,
        tokenBalance: user.tokenBalance,
      });
    }

    // CASE 2: Full App Build (Requires at least 1 Token)
    if (user.tokenBalance <= 0) {
      return NextResponse.json(
        {
          error:
            "You have used all your plan tokens! Buy extra tokens for $1 each or upgrade your plan.",
          code: "OUT_OF_TOKENS",
        },
        { status: 402 }
      );
    }

    // Always run Agent 1: Architect Spec (Visible on ALL plans including FREE)
    const spec = await callGemini(
      `Act as Agent 1 (System Architect). Create a clean, structured Markdown Architecture Specification (Tech stack, core features, API endpoints, database models) for this web app idea:\n"${prompt}"`
    );

    let frontend = "// Locked on Free Plan. Upgrade to Standard ($9 / 10 Tokens) to unlock Agent 2 Frontend UI.";
    let backend = "// Locked on Free Plan. Upgrade to Standard ($9 / 10 Tokens) to unlock Agent 3 Backend API.";
    let database = "// Locked on Free Plan. Upgrade to Standard ($9 / 10 Tokens) to unlock Agent 4 Database Schema.";
    let qa = "# Locked on Free Plan\nUpgrade to Standard ($9), Pro ($49), or Exclusive Plan to unlock Agent 5 Security & Deployment QA.";

    // Only run Agents 2, 3, 4, and 5 if User is on STANDARD ($9), PRO ($49), or EXCLUSIVE
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

    // Deduct 1 Token & Save to GenerationHistory in a single transaction
    const [updatedUser] = await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { tokenBalance: { decrement: 1 } },
      }),
      db.generationHistory.create({
        data: {
          userId: user.id,
          prompt,
          spec,
          frontend,
          backend,
          database,
        },
      }),
    ]);

    return NextResponse.json({
      spec,
      frontend,
      backend,
      database,
      qa,
      tier: updatedUser.tier,
      tokenBalance: updatedUser.tokenBalance,
    });
  } catch (error: any) {
    console.error("ORCHESTRATE ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to orchestrate agents." },
      { status: 500 }
    );
  }
}