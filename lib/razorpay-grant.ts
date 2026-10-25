import { db } from "@/lib/db";
import { MAX_TOPUP, PLAN_DURATION_DAYS, TIER_RANK, TIER_TOKENS, type Tier } from "@/lib/plans";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Grants what a paid Razorpay order bought, exactly once per payment id.
 * `notes` come from the order WE created server-side (never from the browser).
 */
export async function grantRazorpayPayment(args: {
  paymentId: string;
  orderId: string;
  notes: Record<string, string> | undefined;
}): Promise<"granted" | "duplicate" | "ignored"> {
  const { paymentId, orderId, notes } = args;
  const userId = notes?.userId;
  const kind = notes?.kind;
  if (!userId || (kind !== "plan" && kind !== "tokens")) return "ignored";

  try {
    await db.$transaction(async (tx: any) => {
      await tx.razorpayPayment.create({ data: { id: paymentId, orderId, userId, kind } });
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) return;

      if (kind === "plan") {
        const plan = notes!.plan as Tier;
        if (plan !== "STANDARD" && plan !== "PRO") return;
        const now = new Date();
        // Renewing the same plan early extends from the current expiry instead of losing days.
        const base =
          user.tier === plan && user.planExpiresAt && user.planExpiresAt > now
            ? user.planExpiresAt
            : now;
        const expires = new Date(base.getTime() + PLAN_DURATION_DAYS * 86400000);
        const upgrading = TIER_RANK[plan] >= TIER_RANK[user.tier as Tier];
        await tx.user.update({
          where: { id: userId },
          data: {
            tier: upgrading ? plan : user.tier,
            planExpiresAt: upgrading ? expires : user.planExpiresAt,
            tokenBalance: Math.max(user.tokenBalance, TIER_TOKENS[plan]),
            tokenPeriodStart: now,
          },
        });
      } else {
        const count = Math.floor(Number(notes!.tokens));
        if (!Number.isFinite(count) || count < 1 || count > MAX_TOPUP) return;
        await tx.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: count } },
        });
      }
    });
    return "granted";
  } catch (err: any) {
    if (err?.code === "P2002") return "duplicate";
    throw err;
  }
}
