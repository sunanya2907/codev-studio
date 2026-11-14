import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { reportError } from "@/lib/debug-agent";
import { AiUnavailableError, generateText } from "@/lib/ai";
import { qaPrompt } from "@/lib/agents";
import { runStaticChecks } from "@/lib/checks";
import { isHealthcareIdea } from "@/lib/healthcare";
import { isTrackingIdea } from "@/lib/tracking";
import { carriedWarnings, isQaPending } from "@/lib/qa-review";

// Its own function call = its own time budget (separate from the build that wrote the code).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const cap = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}\n/* ...shortened for the review */` : t);

/**
 * Agent 5: reviews the saved code of a finished build and stores the report. It costs no token
 * (it is part of the build) and runs only once per build: after that the saved report is returned.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    const userId = session.user.id;

    let body: { historyId?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const historyId = typeof body.historyId === "string" ? body.historyId : "";
    if (!historyId) return NextResponse.json({ error: "Missing build id." }, { status: 400 });

    const row = await db.generationHistory.findFirst({
      where: { id: historyId, userId }, // ownership check
      select: { id: true, prompt: true, spec: true, frontend: true, backend: true, database: true, qa: true, status: true },
    });
    if (!row) return NextResponse.json({ error: "Build not found." }, { status: 404 });
    if (row.status !== "DONE") return NextResponse.json({ error: "This build is not finished." }, { status: 409 });

    // Already reviewed (or a free build with a locked report): just return what is saved.
    if (!isQaPending(row.qa)) return NextResponse.json({ qa: row.qa, reviewed: true });

    const deadline = Date.now() + (maxDuration - 20) * 1000;
    let text: string;
    let reviewed = true;
    try {
      const r = await generateText(
        qaPrompt(
          cap(row.spec, 30000),
          cap(row.frontend, 60000),
          cap(row.backend, 40000),
          cap(row.database, 20000),
          isTrackingIdea(row.prompt),
          isHealthcareIdea(row.prompt)
        ),
        { deadline, attemptTimeoutMs: 150_000, maxOutputTokens: 8192 }
      );
      text = r.text.trim();
      if ((text.match(/```/g) || []).length === 2 && text.startsWith("```") && text.endsWith("```")) {
        text = text.replace(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n?/, "").replace(/\r?\n?```$/, "").trim();
      }
    } catch (e) {
      reviewed = false;
      console.error("QA AGENT FAILED:", e instanceof AiUnavailableError ? e.reason : e);
      void reportError(e, { source: "server", route: "/api/orchestrate/qa", method: "POST" });
      text =
        "# QA review unavailable\nThe AI reviewer could not run this time. Your app code is complete and the automatic code checks below were run. Use **Customize QA** to ask for the review again.";
    }

    const checks = runStaticChecks(row.spec, row.frontend, row.backend, row.database);
    const qa = `${text}${carriedWarnings(row.qa)}${checks.markdown}`;

    // Only write if nobody finished the review in the meantime.
    await db.generationHistory.updateMany({ where: { id: row.id, userId, qa: row.qa }, data: { qa } });
    return NextResponse.json({ qa, reviewed });
  } catch (error) {
    console.error("QA ROUTE ERROR:", error);
    void reportError(error, { source: "server", route: "/api/orchestrate/qa", method: "POST" });
    return NextResponse.json({ error: "Could not run the review." }, { status: 500 });
  }
}
