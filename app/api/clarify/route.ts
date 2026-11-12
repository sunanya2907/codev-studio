import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AiNotConfiguredError, aiConfigured, generateText } from "@/lib/ai";

export const maxDuration = 60;

const MAX_PROMPT = 500;

export type ClarifyQuestion = { id: string; question: string; options: string[] };

const buildPrompt = (idea: string) => `You help a person who wants a website or web app built from a short idea. Ask exactly 3 short questions whose answers matter most for building THIS specific idea (for example: who will use it, the most important features, the look and feel, whether login or saving data is needed).

Idea: """${idea}"""

Rules:
- Questions must be specific to the idea, simple, and in the same language as the idea.
- Each question gets 3 or 4 short suggested answers (max 6 words each).
- Do not ask about price, hosting or technology.
Answer with ONLY valid JSON, no markdown, in exactly this shape:
{"questions":[{"question":"...","options":["...","...","..."]}]}`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    let body: { prompt?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return NextResponse.json({ error: "Describe your idea first." }, { status: 400 });
    if (prompt.length > MAX_PROMPT) {
      return NextResponse.json({ error: `Prompt is too long (max ${MAX_PROMPT} characters).` }, { status: 400 });
    }
    if (!aiConfigured()) throw new AiNotConfiguredError();

    // Asking the questions is free: no token is charged here, only the build costs a token.
    const r = await generateText(buildPrompt(prompt), { deadline: Date.now() + 40_000, attemptTimeoutMs: 30_000 });
    const json = r.text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(json.slice(json.indexOf("{"), json.lastIndexOf("}") + 1));

    const questions: ClarifyQuestion[] = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter((q: any) => q && typeof q.question === "string" && q.question.trim())
      .slice(0, 3)
      .map((q: any, i: number) => ({
        id: `q${i + 1}`,
        question: String(q.question).trim().slice(0, 160),
        options: (Array.isArray(q.options) ? q.options : [])
          .filter((o: unknown) => typeof o === "string" && o.trim())
          .slice(0, 4)
          .map((o: string) => o.trim().slice(0, 60)),
      }));

    if (questions.length === 0) throw new Error("No questions");
    return NextResponse.json({ questions });
  } catch (err) {
    // The editor falls back to building straight from the idea when this fails.
    return NextResponse.json({ error: "Could not prepare questions." }, { status: 500 });
  }
}
