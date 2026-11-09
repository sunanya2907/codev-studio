import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDebugAgent } from "@/lib/debug-agent";

// Trigger for schedulers (Vercel Cron, GitHub Actions, cron-job.org, ...):
//   GET /api/debug/run   with header  Authorization: Bearer <CRON_SECRET>
// Needed on serverless hosts, where an in-process timer can't keep running.
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const summary = await runDebugAgent(5, { deadline: Date.now() + (maxDuration - 10) * 1000 });
  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
