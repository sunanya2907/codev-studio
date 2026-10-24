import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { TIER_RANK, TIER_TOKENS, type Tier } from "@/lib/plans";
import { getBillingState } from "@/lib/tokens";

const MAX_TOPUP = 500;

/**
 * No payment provider (e.g. Stripe) is connected yet, so upgrading a plan or
 * "buying" tokens here does NOT charge anyone. That is fine while developing,
 * but on a live site it would let every visitor give themselves free plans.
 *
 * => Enabled automatically outside production.
 * => In production it only works if you explicitly set ALLOW_DEMO_BILLING=true.
 */
function demoBillingEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEMO_BILLING === "true"
  );
}

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Applies the monthly token refill when the user's period has ended.
    const user = await getBillingState(userId);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      tier: user.tier,
      tokenBalance: user.tokenBalance,
    });
  } catch (error: unknown) {
    console.error("BILLING GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load billing status." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!demoBillingEnabled()) {
      return NextResponse.json(
        {
          error:
            "Payments are not enabled yet. Plan upgrades and token top-ups will be available once billing is connected.",
        },
        { status: 501 }
      );
    }

    let body: { action?: unknown; plan?: unknown; extraTokens?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { action, plan, extraTokens } = body;

    if (action === "UPGRADE_PLAN") {
      if (typeof plan !== "string" || !(plan in TIER_RANK)) {
        return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
      }
      const newTier = plan as Tier;

      const current = await db.user.findUnique({
        where: { id: userId },
        select: { tier: true },
      });
      if (!current) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }

      // Without this check, re-selecting "Free" (or your current plan) refilled
      // your tokens every time, i.e. unlimited free builds.
      if (TIER_RANK[newTier] <= TIER_RANK[current.tier as Tier]) {
        return NextResponse.json(
          {
            error: `You are already on the ${current.tier} plan (or a higher one).`,
          },
          { status: 400 }
        );
      }

      const updatedUser = await db.user.update({
        where: { id: userId },
        // A new plan starts a fresh monthly token period.
        data: { tier: newTier, tokenBalance: TIER_TOKENS[newTier], tokenPeriodStart: new Date() },
        select: { tier: true, tokenBalance: true },
      });

      return NextResponse.json({
        tier: updatedUser.tier,
        tokenBalance: updatedUser.tokenBalance,
      });
    }

    if (action === "BUY_TOKENS") {
      const count = Math.floor(Number(extraTokens));
      if (!Number.isFinite(count) || count < 1 || count > MAX_TOPUP) {
        return NextResponse.json(
          { error: `Token amount must be between 1 and ${MAX_TOPUP}.` },
          { status: 400 }
        );
      }

      const updatedUser = await db.user.update({
        where: { id: userId },
        data: { tokenBalance: { increment: count } },
        select: { tier: true, tokenBalance: true },
      });

      return NextResponse.json({
        tier: updatedUser.tier,
        tokenBalance: updatedUser.tokenBalance,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    console.error("BILLING POST ERROR:", error);
    return NextResponse.json(
      { error: "Billing request failed." },
      { status: 500 }
    );
  }
}
