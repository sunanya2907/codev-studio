import { db } from "@/lib/db";
import { TIER_TOKENS, type Tier } from "@/lib/plans";

/** Same day next month; Jan 31 + 1 month => Feb 28/29 (never spills into March). */
export function addOneMonth(from: Date): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + 1);
  if (d.getUTCDate() !== day) d.setUTCDate(0); // clamp to last day of the target month
  return d;
}

export type BillingState = { tier: Tier; tokenBalance: number };

/**
 * Applies the monthly refill (paid plans only) if the user's token period has ended, then
 * returns their up-to-date plan + balance. Call it before reading or spending tokens.
 *
 * Refill rule: the balance is topped UP to the plan allowance, never down. Tokens
 * the user bought as $1 top-ups (anything above the allowance) are therefore kept,
 * while unused plan tokens do not pile up from month to month.
 *
 * Race-safe: the period start is "claimed" with a conditional update, so two
 * simultaneous requests cannot both refill.
 */
export async function getBillingState(userId: string): Promise<BillingState | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tier: true, tokenBalance: true, tokenPeriodStart: true, planExpiresAt: true },
  });
  if (!user) return null;

  // Prepaid (Razorpay) plan ran out => back to Free. Bought/remaining tokens are kept.
  if (user.tier !== "FREE" && user.planExpiresAt && new Date() > user.planExpiresAt) {
    await db.user.updateMany({
      where: { id: userId, planExpiresAt: user.planExpiresAt },
      data: { tier: "FREE", planExpiresAt: null },
    });
    return { tier: "FREE", tokenBalance: user.tokenBalance };
  }

  // The Free plan is a ONE-TIME trial: its tokens never refill. Once they are used
  // up, the user must pay (upgrade) to keep building. Only paid plans refill monthly.
  if (user.tier === "FREE") {
    return { tier: user.tier, tokenBalance: user.tokenBalance };
  }

  const now = new Date();
  if (now < addOneMonth(user.tokenPeriodStart)) {
    return { tier: user.tier, tokenBalance: user.tokenBalance };
  }

  const allowance = TIER_TOKENS[user.tier];
  return db.$transaction(async (tx) => {
    const claimed = await tx.user.updateMany({
      where: { id: userId, tokenPeriodStart: user.tokenPeriodStart },
      data: { tokenPeriodStart: now },
    });
    if (claimed.count === 1) {
      await tx.user.updateMany({
        where: { id: userId, tokenBalance: { lt: allowance } },
        data: { tokenBalance: allowance },
      });
    }
    const fresh = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tier: true, tokenBalance: true },
    });
    return { tier: fresh.tier, tokenBalance: fresh.tokenBalance };
  });
}

/**
 * Atomically takes `cost` tokens BEFORE any paid work (Gemini) happens, so two
 * simultaneous requests can't both spend the last token. Returns the new balance,
 * or null if the user can't afford it.
 */
export async function reserveTokens(userId: string, cost: number): Promise<number | null> {
  const reserved = await db.user.updateMany({
    where: { id: userId, tokenBalance: { gte: cost } },
    data: { tokenBalance: { decrement: cost } },
  });
  if (reserved.count === 0) return null;
  const fresh = await db.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });
  return fresh?.tokenBalance ?? 0;
}

/** Gives reserved tokens back when the work they paid for failed. */
export async function refundTokens(userId: string, cost: number): Promise<void> {
  await db.user
    .update({ where: { id: userId }, data: { tokenBalance: { increment: cost } } })
    .catch((err: unknown) => console.error("TOKEN REFUND FAILED:", err));
}
