import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { reportError } from "@/lib/debug-agent";
import { AiNotConfiguredError, AiUnavailableError, aiConfigured, generateText } from "@/lib/ai";
import { CHAT_COST, STANDARD_PRICE_LABEL } from "@/lib/plans";
import { getBillingState, reserveTokens, refundTokens } from "@/lib/tokens";
import { parseFiles, serializeFiles, type GenFile } from "@/lib/files";
import { validateSchema } from "@/lib/validate";
import { logActivity } from "@/lib/activity";

// Project chat: the person talks to the AI about the WHOLE website (review it, ask questions, or change it).
// The AI answers and, when something must change, returns the changed files. Costs CHAT_COST tokens per message
// (reserved first, refunded if the AI fails). The price is deliberately not shown in the UI.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_MESSAGE = 3000;
const MAX_ATTACHMENTS = 4;
const MAX_BASE64 = 2_500_000; // per image / PDF (Vercel rejects request bodies above ~4.5 MB)
const MAX_TOTAL_BASE64 = 3_200_000;
const MAX_TEXT_FILE = 60_000;
const MAX_CODE_IN_PROMPT = 140_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

type Attachment = { name: string; mimeType: string; data?: string; text?: string };

const cap = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}\n/* ...shortened */` : t);

function bucketOf(path: string): "frontend" | "backend" | "database" | null {
  if (path === "prisma/schema.prisma") return "database";
  if (!/\.(tsx?|css)$/.test(path)) return null;
  if (/^app\/api\//.test(path) || /^lib\/(validators|session)\.ts$/.test(path)) return "backend";
  return "frontend";
}

function merge(existing: string, changed: GenFile[], def: string): string {
  const map = new Map(parseFiles(existing, def).map((f) => [f.path, f]));
  for (const f of changed) map.set(f.path, f);
  return serializeFiles([...map.values()]);
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    const userId = session.user.id;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const historyId = typeof body.historyId === "string" ? body.historyId : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!historyId) return NextResponse.json({ error: "Build something first, then chat about it." }, { status: 400 });
    if (!message) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
    if (message.length > MAX_MESSAGE) return NextResponse.json({ error: "That message is too long." }, { status: 413 });

    const rawFiles: Attachment[] = Array.isArray(body.attachments) ? (body.attachments as Attachment[]).slice(0, MAX_ATTACHMENTS) : [];
    const media: { mimeType: string; data: string }[] = [];
    const textFiles: { name: string; text: string }[] = [];
    let total = 0;
    for (const f of rawFiles) {
      if (!f || typeof f.name !== "string") continue;
      if (typeof f.data === "string" && IMAGE_TYPES.includes(f.mimeType)) {
        total += f.data.length;
        if (f.data.length > MAX_BASE64 || total > MAX_TOTAL_BASE64) {
          return NextResponse.json({ error: "The attached files are too big (about 2 MB in total is the limit)." }, { status: 413 });
        }
        media.push({ mimeType: f.mimeType, data: f.data });
      } else if (typeof f.text === "string") {
        textFiles.push({ name: f.name.slice(0, 120), text: f.text.slice(0, MAX_TEXT_FILE) });
      }
    }
    const history = Array.isArray(body.history)
      ? (body.history as { role?: string; text?: string }[])
          .filter((m) => m && (m.role === "user" || m.role === "ai") && typeof m.text === "string")
          .slice(-8)
          .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${String(m.text).slice(0, 1500)}`)
          .join("\n")
      : "";

    if (!aiConfigured()) return NextResponse.json({ error: new AiNotConfiguredError().message }, { status: 500 });

    const user = await getBillingState(userId);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (user.tier === "FREE") {
      return NextResponse.json(
        { error: `Chat is part of the paid plans. Upgrade to Standard (${STANDARD_PRICE_LABEL}) to review and change your whole website here.`, code: "PLAN_LOCKED" },
        { status: 403 }
      );
    }

    const row = await db.generationHistory.findFirst({
      where: { id: historyId, userId }, // ownership check
      select: { id: true, prompt: true, spec: true, frontend: true, backend: true, database: true, status: true },
    });
    if (!row) return NextResponse.json({ error: "Build not found." }, { status: 404 });
    if (row.status === "BUILDING") return NextResponse.json({ error: "Your build is still running. Chat opens when it finishes." }, { status: 409 });

    const balanceAfterReserve = await reserveTokens(userId, CHAT_COST);
    if (balanceAfterReserve === null) {
      return NextResponse.json({ error: "You are out of tokens. Buy more tokens or upgrade your plan to keep chatting.", code: "OUT_OF_TOKENS" }, { status: 402 });
    }

    try {
      const code =
        `FRONTEND FILES:\n${cap(row.frontend, Math.floor(MAX_CODE_IN_PROMPT * 0.55))}\n\nBACKEND FILES:\n${cap(row.backend, Math.floor(MAX_CODE_IN_PROMPT * 0.3))}\n\nPRISMA SCHEMA:\n${cap(row.database, Math.floor(MAX_CODE_IN_PROMPT * 0.15))}`;
      const prompt = `You are a senior full-stack engineer and the project assistant of an AI website builder. The person built the website below and now chats with you about the WHOLE website. Think carefully before answering.

What you can do:
- REVIEW: answer questions about the site, explain how something works, find bugs, security or UX problems, and suggest improvements. Be concrete and refer to real file names.
- CHANGE: when the person asks for a change (design, text, a new page, a new field, a fix, anything), make it for real across ALL affected files: pages, components, API routes, validators and the Prisma schema. Keep everything consistent (names, API paths and JSON shapes, schema fields) so the site still compiles and runs after the change. Do not break existing features.
- If the person attached images or files, use them (a screenshot or design to copy, a logo to describe, data to use, a spec to follow).
- If the request is unclear, ask ONE short question instead of guessing, and change nothing.

Rules for the code: Next.js App Router + TypeScript + Tailwind + Prisma. Frontend imports only react, next/link, next/navigation, lucide-react and "@/..." files. Backend packages only next, zod, @prisma/client, jose, bcryptjs; import the database only as: import { db } from "@/lib/db". Keep every page working with the real API.

OUTPUT FORMAT (strict):
=== REPLY ===
<your answer to the person in plain, friendly language: what you found, or what you changed and which files. No code blocks, under 200 words>
Then, ONLY for files you changed or created, each file COMPLETE (never partial, never a diff):
=== FILE: <relative/path.ext> ===
<complete file contents>
Return changed files only (unchanged files are kept automatically). If a file in the listing below ends with "...shortened", it was cut for length: do not rewrite that file. If nothing must change, return only the REPLY. No markdown fences around files.

THE WEBSITE IDEA:
${row.prompt.slice(0, 2000)}

REQUIREMENTS (SRS, shortened):
${cap(row.spec, 12000)}

${code}
${textFiles.length ? `\nFILES THE PERSON ATTACHED:\n${textFiles.map((f) => `--- ${f.name} ---\n${f.text}`).join("\n\n")}\n` : ""}${media.length ? `\n(${media.length} image/PDF attachment(s) are sent along with this message.)\n` : ""}
${history ? `\nCONVERSATION SO FAR:\n${history}\n` : ""}
NEW MESSAGE FROM THE PERSON:
${message}`;

      const deadline = Date.now() + (process.env.VERCEL ? 285_000 : 15 * 60_000);
      const result = await generateText(prompt, {
        deadline,
        attemptTimeoutMs: 270_000,
        attachments: media,
        meta: { userId, purpose: "chat" },
      });
      const out = result.text.trim();

      // Split into the reply and the changed files.
      const firstFile = out.search(/^=== FILE: /m);
      const head = firstFile >= 0 ? out.slice(0, firstFile) : out;
      let reply = head.replace(/^\s*=== REPLY ===\s*/, "").trim();
      const files = firstFile >= 0 ? parseFiles(out.slice(firstFile), "app/page.tsx") : [];

      const changed: string[] = [];
      const skipped: string[] = [];
      const fe: GenFile[] = [];
      const be: GenFile[] = [];
      let schema: string | null = null;
      for (const f of files) {
        const b = bucketOf(f.path);
        if (!b) {
          skipped.push(f.path);
          continue;
        }
        if (b === "database") {
          if (validateSchema(f.content).length === 0) {
            schema = f.content;
            changed.push(f.path);
          } else skipped.push(f.path);
        } else {
          (b === "frontend" ? fe : be).push(f);
          changed.push(f.path);
        }
      }

      const next = {
        frontend: fe.length ? merge(row.frontend, fe, "app/page.tsx") : row.frontend,
        backend: be.length ? merge(row.backend, be, "app/api/route.ts") : row.backend,
        database: schema ?? row.database,
      };
      if (changed.length) {
        await db.generationHistory.updateMany({ where: { id: row.id, userId }, data: next });
      }
      if (!reply) reply = changed.length ? `Done. I updated ${changed.length} file${changed.length === 1 ? "" : "s"}.` : "I could not make a change from that. Could you say it another way?";
      if (skipped.length) reply += `\n\n(Ignored files I cannot apply: ${skipped.slice(0, 5).join(", ")})`;

      await logActivity(userId, "CHAT", message, CHAT_COST);
      return NextResponse.json({ reply, changed, ...next, tokenBalance: balanceAfterReserve });
    } catch (err) {
      await refundTokens(userId, CHAT_COST);
      throw err;
    }
  } catch (error: unknown) {
    console.error("CHAT ERROR:", error);
    void reportError(error, { source: "server", route: "/api/orchestrate/chat", method: "POST" });
    const message =
      error instanceof AiUnavailableError
        ? `${error.message} You were not charged.`
        : error instanceof Error && error.message
        ? error.message
        : "The chat failed. You were not charged.";
    return NextResponse.json({ error: message }, { status: error instanceof AiUnavailableError ? 503 : 500 });
  }
}
