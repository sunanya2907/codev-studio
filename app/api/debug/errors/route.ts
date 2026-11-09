import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isDebugAdmin, runDebugAgent } from "@/lib/debug-agent";

export const maxDuration = 60;

async function guard() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isDebugAdmin(session.user.email)) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const errors = await db.errorLog.findMany({ orderBy: { lastSeenAt: "desc" }, take: 100 });
  const counts = await db.errorLog.groupBy({ by: ["status"], _count: { _all: true } });
  return NextResponse.json({
    errors,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
}

// { action: "run" }                        -> run the agent now
// { action: "resolve" | "reanalyze", id }  -> change one error
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  let body: { action?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.action === "run") {
    const summary = await runDebugAgent(5, { deadline: Date.now() + (maxDuration - 10) * 1000 });
    return NextResponse.json(summary);
  }
  if (typeof body.id !== "string" || !body.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  if (body.action === "resolve") {
    await db.errorLog.updateMany({ where: { id: body.id }, data: { status: "RESOLVED" } });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "reanalyze") {
    await db.errorLog.updateMany({ where: { id: body.id }, data: { status: "NEW", attempts: 0 } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
