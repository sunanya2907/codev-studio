import "server-only";
import { db } from "@/lib/db";
import { BUILD_COST } from "@/lib/plans";
import { refundTokens } from "@/lib/tokens";

/** A build that has been BUILDING longer than this was killed (the host stopped the function). */
export const BUILD_STALE_MS = 7 * 60 * 1000;

/**
 * Marks a running build as FAILED and gives the token back. Safe to call twice: only the call
 * that actually flips BUILDING -> FAILED refunds, so a token is never returned two times.
 */
export async function failBuild(userId: string, historyId: string, message: string): Promise<boolean> {
  const r = await db.generationHistory.updateMany({
    where: { id: historyId, userId, status: "BUILDING" },
    data: { status: "FAILED", error: message.slice(0, 500) },
  });
  if (r.count === 1) {
    await refundTokens(userId, BUILD_COST);
    return true;
  }
  return false;
}

/** Cleans up builds whose server died mid-way, so no user is left charged for nothing. */
export async function reconcileStaleBuilds(userId: string): Promise<void> {
  const stale = await db.generationHistory.findMany({
    where: { userId, status: "BUILDING", createdAt: { lt: new Date(Date.now() - BUILD_STALE_MS) } },
    select: { id: true },
  });
  for (const s of stale) {
    await failBuild(userId, s.id, "The build did not finish because the server was interrupted. Your token was returned.");
  }
}
