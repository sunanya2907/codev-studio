import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { reportError } from "@/lib/debug-agent";
import { AiUnavailableError, generateText } from "@/lib/ai";
import { flowPrompt } from "@/lib/agents";

// Its own function call = its own time budget, like the QA agent.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const cap = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}\n...shortened` : t);
const filePaths = (blob: string) =>
  [...blob.matchAll(/^=== FILE: (.+?) ===[ \t]*$/gm)].map((m) => m[1].trim()).slice(0, 60);
const hasDiagram = (t: string) => /```mermaid\s+flowchart/i.test(t);

/**
 * Writes the pseudocode and flowcharts of a finished build and stores them.
 * No token cost (part of the build). Runs once per build; afterwards the saved text is returned.
 * Free plan: not generated (the sidebar shows it locked).
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    const userId = session.user.id;

    let body: { historyId?: unknown; regenerate?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const historyId = typeof body.historyId === "string" ? body.historyId : "";
    if (!historyId) return NextResponse.json({ error: "Missing build id." }, { status: 400 });

    const me = await db.user.findUnique({ where: { id: userId }, select: { tier: true } });
    if (!me) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (me.tier === "FREE") return NextResponse.json({ error: "Upgrade to unlock the pseudocode and flowchart.", code: "PLAN_LOCKED" }, { status: 403 });

    const row = await db.generationHistory.findFirst({
      where: { id: historyId, userId }, // ownership check
      select: { id: true, spec: true, frontend: true, backend: true, flow: true, status: true },
    });
    if (!row) return NextResponse.json({ error: "Build not found." }, { status: 404 });
    if (row.status !== "DONE") return NextResponse.json({ error: "This build is not finished." }, { status: 409 });

    // Already written: return it (unless the person asked to write it again).
    if (row.flow && row.flow.trim() && body.regenerate !== true) return NextResponse.json({ flow: row.flow, created: false });

    const deadline = Date.now() + (maxDuration - 20) * 1000;
    const prompt = flowPrompt(cap(row.spec, 30000), filePaths(row.frontend), filePaths(row.backend));
    let text = "";
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const extra = attempt === 0 ? "" : "\n\nYOUR PREVIOUS ANSWER HAD NO VALID mermaid FLOWCHART. Return the COMPLETE answer again; every diagram must be a ```mermaid block starting with the line 'flowchart TD'.";
        const r = await generateText(prompt + extra, { deadline, attemptTimeoutMs: 150_000, maxOutputTokens: 8192 });
        text = r.text.trim();
        if ((text.match(/```/g) || []).length === 2 && text.startsWith("```") && text.endsWith("```")) {
          text = text.replace(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n?/, "").replace(/\r?\n?```$/, "").trim();
        }
        if (hasDiagram(text)) break;
        if (deadline - Date.now() < 60_000) break;
      }
    } catch (e) {
      console.error("FLOW AGENT FAILED:", e instanceof AiUnavailableError ? e.reason : e);
      void reportError(e, { source: "server", route: "/api/orchestrate/flow", method: "POST" });
      return NextResponse.json({ error: "The pseudocode and flowchart could not be created this time. Use Customize to ask for it again." }, { status: 503 });
    }
    if (!text) return NextResponse.json({ error: "Nothing was returned. Please try again." }, { status: 502 });

    await db.generationHistory.updateMany({ where: { id: row.id, userId }, data: { flow: text } });
    return NextResponse.json({ flow: text, created: true });
  } catch (error) {
    console.error("FLOW ROUTE ERROR:", error);
    void reportError(error, { source: "server", route: "/api/orchestrate/flow", method: "POST" });
    return NextResponse.json({ error: "Could not create the pseudocode and flowchart." }, { status: 500 });
  }
}
