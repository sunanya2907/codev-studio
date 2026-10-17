import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { prompt, agent, currentCode, instruction } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is missing." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

    const callGemini = async (systemPrompt: string) => {
      const result = await model.generateContent(systemPrompt);
      const text = result.response.text();
      if (!text) throw new Error("Gemini returned an empty response.");
      return text;
    };

    const stripMarkdown = (text: string) => {
      return text.replace(/^```(?:\w+)?\s*/i, "").replace(/\s*```$/i, "").trim();
    };

    // ==========================================
    // HANDLE INDIVIDUAL AGENT CUSTOMIZATIONS
    // ==========================================
    if (instruction && currentCode) {
      let refinePrompt = "";

      if (agent === "architect") {
        refinePrompt = `You are Agent 1: Lead Software Architect. Modify the existing specification according to the request: ${instruction}\nExisting: ${currentCode}\nReturn ONLY plain text. Do not use markdown code fences.`;
      } else if (agent === "frontend") {
        refinePrompt = `You are Agent 2: Expert Frontend Engineer. Modify the frontend code according to the request: ${instruction}\nExisting: ${currentCode}\nReturn ONLY code (plain JS/JSX, self-contained). Do NOT use markdown code fences.`;
      } else if (agent === "backend") {
        refinePrompt = `You are Agent 3: Expert Backend Engineer. Modify the Next.js API route according to the request: ${instruction}\nExisting: ${currentCode}\nReturn ONLY code. Do NOT use markdown code fences.`;
      } else if (agent === "database") {
        refinePrompt = `You are Agent 4: Expert Database Administrator. Modify the Prisma schema according to the request: ${instruction}\nExisting: ${currentCode}\nRules: Return complete valid Prisma schema code. Use PostgreSQL. Return ONLY code. Do NOT use markdown code fences.`;
      } else {
        return NextResponse.json({ error: "Invalid agent specified." }, { status: 400 });
      }

      const updatedCode = await callGemini(refinePrompt);
      return NextResponse.json({ updatedCode: stripMarkdown(updatedCode) });
    }

    // ==========================================
    // HANDLE FULL APP GENERATION (ALL 4 AGENTS)
    // ==========================================
    if (!prompt?.trim()) return NextResponse.json({ error: "Prompt is required." }, { status: 400 });

    const architectPrompt = `You are Agent 1: Lead Software Architect. User's application idea: ${prompt}. Create a concise technical specification including: overview, UI components, data structures, REST API routes, validation, and suggested DB schema. Return ONLY plain text. Do not return code fences.`;
    const spec = await callGemini(architectPrompt);

    const frontendPrompt = `You are Agent 2: Expert Frontend Engineer. Build a self-contained, interactive React/Next.js frontend based on this spec: ${spec}. Original request: ${prompt}. Return ONE complete React component in plain JS/JSX. Use Tailwind. Include mock state. Return ONLY clean code. Do NOT use markdown code fences.`;
    const backendPrompt = `You are Agent 3: Expert Backend Engineer. Build realistic Next.js API route code based on this spec: ${spec}. Return ONLY code. Do NOT use markdown code fences.`;
    const databasePrompt = `You are Agent 4: Database Administrator. Build a production-ready Prisma schema (schema.prisma) based on this architecture specification: ${spec}. Original request: ${prompt}. Requirements: Use postgresql as the provider. Include necessary models and relations. Return ONLY valid Prisma schema code. Do NOT use markdown code fences.`;

    const [frontendCode, backendCode, databaseCode] = await Promise.all([
      callGemini(frontendPrompt),
      callGemini(backendPrompt),
      callGemini(databasePrompt)
    ]);

    const cleanSpec = spec.trim();
    const cleanFrontend = stripMarkdown(frontendCode);
    const cleanBackend = stripMarkdown(backendCode);
    const cleanDatabase = stripMarkdown(databaseCode);

    // Save generation to history in DB if user is signed in
    const session = await auth();
    if (session?.user?.id) {
      try {
        await db.generationHistory.create({
          data: {
            userId: session.user.id,
            prompt: prompt.trim(),
            spec: cleanSpec,
            frontend: cleanFrontend,
            backend: cleanBackend,
            database: cleanDatabase,
          },
        });
      } catch (dbErr) {
        console.error("Failed to save generation history:", dbErr);
      }
    }

    return NextResponse.json({
      spec: cleanSpec,
      frontend: cleanFrontend,
      backend: cleanBackend,
      database: cleanDatabase
    });

  } catch (error: any) {
    console.error("ORCHESTRATION ERROR:", error);
    return NextResponse.json({ error: error?.message || "Operation failed." }, { status: 500 });
  }
}