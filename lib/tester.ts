// Tester / developer invite links.
//
// An admin creates a link such as  https://YOUR-SITE/tester?code=<secret>.
// A signed-in person who opens it gets a TEMPORARY plan (default: Exclusive, so every
// feature is unlocked) plus a capped token allowance. When the time is up the existing
// logic in lib/tokens.ts (planExpiresAt) puts them back on Free automatically.
//
// Guard rails: the link expires, has a use limit, can be revoked, can be redeemed once per
// person, never downgrades a paying customer, and only a hash of the secret is stored.
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { TIER_RANK, type Tier } from "@/lib/plans";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type InviteOptions = {
  label: string;
  tier?: Tier;
  tokens?: number; // tokens granted on redeem (capped: every build is a real AI call)
  accessDays?: number; // how long testers keep the plan
  maxUses?: number;
  linkValidDays?: number; // how long the link itself can be opened
  createdBy: string;
};

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

export async function createInvite(o: InviteOptions) {
  const token = randomBytes(24).toString("base64url");
  const tier: Tier = o.tier && o.tier in TIER_RANK && o.tier !== "FREE" ? o.tier : "EXCLUSIVE";
  const invite = await db.testerInvite.create({
    data: {
      tokenHash: hash(token),
      label: (o.label || "Tester invite").slice(0, 80),
      tier,
      tokens: clamp(o.tokens, 1, 500, 50),
      accessDays: clamp(o.accessDays, 1, 90, 14),
      maxUses: clamp(o.maxUses, 1, 1000, 10),
      expiresAt: new Date(Date.now() + clamp(o.linkValidDays, 1, 90, 14) * 86400000),
      createdBy: o.createdBy,
    },
  });
  return { invite, token }; // the token is shown ONCE; it cannot be recovered later
}

export type RedeemResult =
  | { ok: true; tier: Tier; tokenBalance: number; expiresAt: Date | null; note?: string }
  | { ok: false; error: string; status: number };

export async function redeemInvite(userId: string, token: string): Promise<RedeemResult> {
  if (!token || token.length < 16 || token.length > 100) {
    return { ok: false, error: "This tester link is not valid.", status: 400 };
  }
  const invite = await db.testerInvite.findUnique({ where: { tokenHash: hash(token) } });
  if (!invite) return { ok: false, error: "This tester link is not valid.", status: 404 };
  if (invite.revokedAt) return { ok: false, error: "This tester link was revoked.", status: 410 };
  if (invite.expiresAt < new Date()) return { ok: false, error: "This tester link has expired.", status: 410 };

  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) return { ok: false as const, error: "User not found.", status: 404 };

      // Atomic use counter: two people can't both take the last slot.
      const claimed = await tx.testerInvite.updateMany({
        where: { id: invite.id, revokedAt: null, uses: { lt: invite.maxUses } },
        data: { uses: { increment: 1 } },
      });
      if (claimed.count === 0) {
        return { ok: false as const, error: "This tester link has reached its limit.", status: 410 };
      }
      // One redemption per person (unique index) => P2002 is handled below.
      await tx.testerRedemption.create({ data: { inviteId: invite.id, userId } });

      const now = new Date();
      const invTier = invite.tier as Tier;
      const upgrading = TIER_RANK[invTier] > TIER_RANK[user.tier as Tier];
      const expires = new Date(now.getTime() + invite.accessDays * 86400000);

      // Never downgrade (or shorten) someone who already pays; they only get the tokens.
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          tokenBalance: { increment: invite.tokens },
          ...(upgrading
            ? { tier: invTier, planExpiresAt: expires, tokenPeriodStart: now }
            : {}),
        },
        select: { tier: true, tokenBalance: true, planExpiresAt: true },
      });
      return {
        ok: true as const,
        tier: updated.tier as Tier,
        tokenBalance: updated.tokenBalance,
        expiresAt: upgrading ? expires : updated.planExpiresAt,
        note: upgrading ? undefined : "You already have an equal or higher plan, so only the tokens were added.",
      };
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "P2002") {
      return { ok: false, error: "You already used this tester link.", status: 409 };
    }
    throw err;
  }
}
