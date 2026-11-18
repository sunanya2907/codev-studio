import "server-only";
// Changes an admin can make to a person. Used by the user page and by "accept request".
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { TIER_RANK, type Tier } from "@/lib/plans";

export const clampInt = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

export const isTier = (t: unknown): t is Tier => typeof t === "string" && t in TIER_RANK;

type Tx = Prisma.TransactionClient | typeof db;

/**
 * Give tokens and / or a temporary plan. Same rule as a tester link: a plan is only ever
 * UPGRADED (a paying customer is never downgraded or shortened); tokens are always added.
 */
export async function grantAccess(tx: Tx, userId: string, g: { tier?: Tier | null; tokens?: number; days?: number }) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { tier: true } });
  if (!user) throw new Error("User not found.");
  const tokens = Math.max(0, Math.floor(g.tokens || 0));
  const now = new Date();
  const upgrading = !!g.tier && g.tier !== "FREE" && TIER_RANK[g.tier] > TIER_RANK[user.tier as Tier];
  const days = clampInt(g.days, 1, 365, 14);
  return tx.user.update({
    where: { id: userId },
    data: {
      ...(tokens > 0 ? { tokenBalance: { increment: tokens } } : {}),
      ...(upgrading ? { tier: g.tier as Tier, planExpiresAt: new Date(now.getTime() + days * 86400000), tokenPeriodStart: now } : {}),
    },
    select: { tier: true, tokenBalance: true, planExpiresAt: true },
  });
}
