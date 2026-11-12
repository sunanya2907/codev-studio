import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isDebugAdmin } from "@/lib/debug-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Database health check. Open /api/health/db while signed in as an admin (ADMIN_EMAILS).
 * It checks the connection, that every table of prisma/schema.prisma exists and can be read,
 * and that the database can WRITE (a row is created and removed again).
 */
export async function GET() {
  const session = await auth();
  if (!isDebugAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const checks: Record<string, { ok: boolean; ms?: number; detail?: string | number }> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      const v = await fn();
      checks[name] = { ok: true, ms: Date.now() - t, detail: typeof v === "number" ? v : undefined };
    } catch (e) {
      checks[name] = { ok: false, ms: Date.now() - t, detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
    }
  };

  await run("connection", () => db.$queryRaw`SELECT 1`);
  await run("table User (rows)", () => db.user.count());
  await run("table Account (rows)", () => db.account.count());
  await run("table Session (rows)", () => db.session.count());
  await run("table VerificationToken (rows)", () => db.verificationToken.count());
  await run("table Project (rows)", () => db.project.count());
  await run("table GenerationHistory (rows)", () => db.generationHistory.count());
  await run("table StripeEvent (rows)", () => db.stripeEvent.count());
  await run("table RazorpayPayment (rows)", () => db.razorpayPayment.count());
  await run("table VoiceSession (rows)", () => db.voiceSession.count());
  await run("table ErrorLog (rows)", () => db.errorLog.count());
  await run("table TesterInvite (rows)", () => db.testerInvite.count());
  await run("table TesterRedemption (rows)", () => db.testerRedemption.count());
  await run("write + delete", async () => {
    const id = `healthcheck-${Date.now()}`;
    await db.stripeEvent.create({ data: { id, type: "healthcheck" } });
    await db.stripeEvent.delete({ where: { id } });
  });

  const failed = Object.entries(checks).filter(([, c]) => !c.ok).map(([n]) => n);
  return NextResponse.json(
    { ok: failed.length === 0, failed, checks, time: new Date().toISOString() },
    { status: failed.length === 0 ? 200 : 500 }
  );
}
