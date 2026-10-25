import { db } from "@/lib/db";
import { VOICE_MAX_GAP_SECONDS, VOICE_SECONDS_PER_TOKEN } from "@/lib/plans";

/**
 * Voice billing: $0.25/minute, paid with tokens.
 *
 * - A user has a prepaid pool of voice seconds (User.voiceSeconds).
 * - Starting a session when the pool is nearly empty converts ONE token into
 *   VOICE_SECONDS_PER_TOKEN seconds (240 s = 4 min). Unused seconds are kept.
 * - Time is metered by the SERVER clock, never by the browser: every tick/turn bills
 *   the whole time since the previous one. A session that goes silent for more than
 *   VOICE_MAX_GAP_SECONDS is closed, so a client can't get free time by skipping ticks.
 */

const MIN_START_SECONDS = 10;

export type StartResult =
  | { ok: true; sessionId: string; voiceSeconds: number; tokenBalance: number; boughtWithToken: boolean }
  | { ok: false; reason: "OUT_OF_TOKENS" };

export async function startVoiceSession(userId: string): Promise<StartResult> {
  // Any older session of this user is over (time up to its last tick is already billed).
  await db.voiceSession.updateMany({
    where: { userId, status: "active" },
    data: { status: "ended", endedAt: new Date() },
  });

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { voiceSeconds: true },
    });
    if (!user) return { ok: false, reason: "OUT_OF_TOKENS" } as const;

    let boughtWithToken = false;
    if (user.voiceSeconds < MIN_START_SECONDS) {
      const bought = await tx.user.updateMany({
        where: { id: userId, tokenBalance: { gte: 1 } },
        data: {
          tokenBalance: { decrement: 1 },
          voiceSeconds: { increment: VOICE_SECONDS_PER_TOKEN },
        },
      });
      if (bought.count === 0) return { ok: false, reason: "OUT_OF_TOKENS" } as const;
      boughtWithToken = true;
    }

    const session = await tx.voiceSession.create({ data: { userId }, select: { id: true } });
    const fresh = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { voiceSeconds: true, tokenBalance: true },
    });
    return {
      ok: true,
      sessionId: session.id,
      voiceSeconds: fresh.voiceSeconds,
      tokenBalance: fresh.tokenBalance,
      boughtWithToken,
    } as const;
  });
}

export type ChargeResult =
  | { state: "active"; remainingSeconds: number }
  | { state: "exhausted"; remainingSeconds: 0 } // pool used up (session closed)
  | { state: "expired" } // went silent too long (session closed)
  | { state: "inactive" }; // unknown / already ended / not yours

/** Bills the time since the last tick/turn. Safe to call concurrently. */
export async function chargeElapsed(userId: string, sessionId: string): Promise<ChargeResult> {
  const session = await db.voiceSession.findFirst({
    where: { id: sessionId, userId, status: "active" },
  });
  if (!session) return { state: "inactive" };

  const now = new Date();
  const gap = Math.max(1, Math.ceil((now.getTime() - session.lastTickAt.getTime()) / 1000));

  if (gap > VOICE_MAX_GAP_SECONDS) {
    await db.voiceSession.updateMany({
      where: { id: sessionId, status: "active" },
      data: { status: "ended", endedAt: now },
    });
    return { state: "expired" };
  }

  // Claim this window: if another request already billed it, don't bill it twice.
  const claimed = await db.voiceSession.updateMany({
    where: { id: sessionId, status: "active", lastTickAt: session.lastTickAt },
    data: { lastTickAt: now, secondsBilled: { increment: gap } },
  });

  const before = await db.user.findUnique({ where: { id: userId }, select: { voiceSeconds: true } });
  let remaining = before?.voiceSeconds ?? 0;

  if (claimed.count === 1) {
    const take = Math.min(gap, remaining);
    if (take > 0) {
      await db.user.updateMany({
        where: { id: userId, voiceSeconds: { gte: take } },
        data: { voiceSeconds: { decrement: take } },
      });
      remaining -= take;
    }
  }

  if (remaining <= 0) {
    await db.voiceSession.updateMany({
      where: { id: sessionId, status: "active" },
      data: { status: "ended", endedAt: now },
    });
    return { state: "exhausted", remainingSeconds: 0 };
  }
  return { state: "active", remainingSeconds: remaining };
}

export async function endVoiceSession(userId: string, sessionId: string): Promise<number> {
  const result = await chargeElapsed(userId, sessionId);
  await db.voiceSession.updateMany({
    where: { id: sessionId, userId, status: "active" },
    data: { status: "ended", endedAt: new Date() },
  });
  return "remainingSeconds" in result ? result.remainingSeconds : 0;
}
