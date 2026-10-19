import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "../../../lib/db";

export async function GET() {
  try {
    const session = await auth();
    let userId = session?.user?.id;

    let user;
    if (userId) {
      user = await db.user.findUnique({
        where: { id: userId },
        select: { tier: true, tokenBalance: true },
      });
    }

    if (!user) {
      // Auto-fallback or create default user for testing
      user = await db.user.findFirst();
      if (!user) {
        user = await db.user.create({
          data: {
            email: "developer@buildcore.app",
            name: "Sunanya Goswami",
            tier: "FREE",
            tokenBalance: 3,
          },
          select: { tier: true, tokenBalance: true },
        });
      }
    }

    return NextResponse.json({
      tier: user?.tier || "FREE",
      tokenBalance: user?.tokenBalance ?? 3,
    });
  } catch (error: any) {
    return NextResponse.json({ tier: "FREE", tokenBalance: 3 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    let userId = session?.user?.id;

    if (!userId) {
      const firstUser = await db.user.findFirst();
      if (firstUser) {
        userId = firstUser.id;
      } else {
        const newUser = await db.user.create({
          data: {
            email: "developer@buildcore.app",
            name: "Sunanya Goswami",
            tier: "FREE",
            tokenBalance: 3,
          },
        });
        userId = newUser.id;
      }
    }

    const { action, plan, extraTokens } = await req.json();

    if (action === "UPGRADE_PLAN") {
      let tokensToSet = 3;
      let newTier: "FREE" | "STANDARD" | "PRO" | "EXCLUSIVE" = "FREE";

      if (plan === "STANDARD") {
        newTier = "STANDARD";
        tokensToSet = 10;
      } else if (plan === "PRO") {
        newTier = "PRO";
        tokensToSet = 50;
      } else if (plan === "EXCLUSIVE") {
        newTier = "EXCLUSIVE";
        tokensToSet = 250;
      }

      const updatedUser = await db.user.update({
        where: { id: userId },
        data: { tier: newTier, tokenBalance: tokensToSet },
      });

      return NextResponse.json({
        tier: updatedUser.tier,
        tokenBalance: updatedUser.tokenBalance,
      });
    }

    if (action === "BUY_TOKENS") {
      const count = Math.max(1, Number(extraTokens) || 1);
      const updatedUser = await db.user.update({
        where: { id: userId },
        data: { tokenBalance: { increment: count } },
      });

      return NextResponse.json({
        tier: updatedUser.tier,
        tokenBalance: updatedUser.tokenBalance,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}