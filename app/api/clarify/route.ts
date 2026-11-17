import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AiNotConfiguredError, aiConfigured, generateText } from "@/lib/ai";

export const maxDuration = 60;

const MAX_PROMPT = 1000;

export type ClarifyQuestion = { id: string; question: string; options: string[] };

const buildPrompt = (idea: string) => `You help a person who wants a website or web app built from a short idea. Ask exactly 3 short questions whose answers matter most for building THIS specific idea (for example: who will use it, the most important features, the look and feel, whether login or saving data is needed).

Idea: """${idea}"""

Rules:
- Questions must be specific to the idea, simple, and in the same language as the idea.
- Each question gets 3 or 4 short suggested answers (max 6 words each).
- Do not ask about price, hosting or technology.
Answer with ONLY valid JSON, no markdown, in exactly this shape:
{"questions":[{"question":"...","options":["...","...","..."]}]}`;

const ADVANCED_COUNT = 7;

// Advanced mode: open questions about the WEBSITE itself (pages, roles, login, data, money, rules).
const buildAdvancedPrompt = (idea: string) => `You are a senior product analyst. A person wants a website or web app built from a short idea. Ask exactly ${ADVANCED_COUNT} advanced, open-ended questions that decide how THIS specific website must be structured. Cover these areas, one question each, in this order:
1. Pages: which public pages and which signed-in pages must exist, and what each shows.
2. Roles: who are the users (visitor, normal user, admin, staff, vendor...) and what can each role see and do.
3. Admin panel: what the admin must manage (users, content, orders, reports, settings, approvals).
4. Core user flow: the most important thing a user does from start to finish, step by step.
5. Data: what information must be stored and how records relate (for example users, orders, bookings, messages).
6. Money and rules: payments, plans, limits, approvals, emails or notifications, anything with business rules. If the idea has no payments, ask about notifications and rules.
7. Security and edge cases: login method, sensitive data, what must never be allowed, what happens when something goes wrong.

Idea: """${idea}"""

Rules:
- Every question must mention or clearly fit THIS idea, not a generic website. Use the idea's own words (for example "doctors" and "patients", not "users").
- Questions are open: they are answered with a sentence or a short list, not yes or no.
- Each question gets 3 short example answers (max 10 words each) that the person can tap to start from.
- Same language as the idea. Do not ask about price of the service, hosting or technology.
Answer with ONLY valid JSON, no markdown, in exactly this shape:
{"questions":[{"question":"...","options":["...","...","..."]}]}`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    let body: { prompt?: unknown; mode?: unknown };
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

    const advanced = body.mode === "advanced";
    // Asking the questions is free: no token is charged here, only the build costs tokens.
    const r = await generateText(advanced ? buildAdvancedPrompt(prompt) : buildPrompt(prompt), {
      deadline: Date.now() + (advanced ? 50_000 : 40_000),
      attemptTimeoutMs: advanced ? 40_000 : 30_000,
    });
    const json = r.text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(json.slice(json.indexOf("{"), json.lastIndexOf("}") + 1));

    const questions: ClarifyQuestion[] = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter((q: any) => q && typeof q.question === "string" && q.question.trim())
      .slice(0, advanced ? ADVANCED_COUNT : 3)
      .map((q: any, i: number) => ({
        id: `q${i + 1}`,
        question: String(q.question).trim().slice(0, advanced ? 260 : 160),
        options: (Array.isArray(q.options) ? q.options : [])
          .filter((o: unknown) => typeof o === "string" && o.trim())
          .slice(0, advanced ? 3 : 4)
          .map((o: string) => o.trim().slice(0, advanced ? 90 : 60)),
      }));

    if (questions.length === 0) throw new Error("No questions");
    return NextResponse.json({ questions });
  } catch (err) {
    // The editor falls back to building straight from the idea when this fails.
    return NextResponse.json({ error: "Could not prepare questions." }, { status: 500 });
  }
}