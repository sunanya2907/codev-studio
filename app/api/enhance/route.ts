import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AiNotConfiguredError, aiConfigured, generateText } from "@/lib/ai";

export const maxDuration = 60;

const MAX_IN = 500;
const MAX_OUT = 500; // the editor's idea box holds 500 characters

const buildPrompt = (idea: string) => `Rewrite the website idea below into ONE clearer, richer request that a developer can build from.

Idea: """${idea}"""

Rules:
- Keep the person's original intent; do not invent a different product.
- Add the useful details that are missing: who it is for, the 4 to 6 key features, the pages, and the look and feel.
- Write it as the person's own request ("Build a ..."), in the same language as the idea.
- Maximum ${MAX_OUT - 40} characters. Plain text only: no markdown, no lists, no quotes, no preamble.`;

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
    if (!prompt) return NextResponse.json({ error: "Type your idea first." }, { status: 400 });
    if (prompt.length > MAX_IN) {
      return NextResponse.json({ error: `Prompt is too long (max ${MAX_IN} characters).` }, { status: 400 });
    }
    if (!aiConfigured()) throw new AiNotConfiguredError();

    // Free: enhancing the idea does not use a token, only the build does.
    const r = await generateText(buildPrompt(prompt), { deadline: Date.now() + 40_000, attemptTimeoutMs: 30_000 });
    const text = r.text
      .replace(/```[a-z]*|```/g, "")
      .replace(/[*_#`>]/g, "")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, MAX_OUT)
      .trim();
    if (!text) throw new Error("Empty");
    return NextResponse.json({ prompt: text });
  } catch {
    return NextResponse.json({ error: "Could not enhance the prompt. Please try again." }, { status: 500 });
  }
}