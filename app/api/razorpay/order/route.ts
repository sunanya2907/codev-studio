import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { MAX_TOPUP, PLAN_PRICE_PAISE, TOKEN_PRICE_PAISE } from "@/lib/plans";
import { razorpayConfigured, razorpayCreateOrder } from "@/lib/razorpay";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

    if (!razorpayConfigured()) {
      return NextResponse.json(
        { error: "Razorpay is not configured.", code: "RAZORPAY_NOT_CONFIGURED" },
        { status: 501 }
      );
    }

    let body: { action?: unknown; plan?: unknown; tokens?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, stripeSubscriptionId: true },
    });
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

    let amountPaise: number;
    let notes: Record<string, string>;
    let label: string;

    if (body.action === "PLAN") {
      const plan = body.plan;
      if (plan !== "STANDARD" && plan !== "PRO") {
        return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
      }
      if (user.stripeSubscriptionId) {
        return NextResponse.json(
          { error: "You already have an active card subscription. Manage it from 'Manage subscription'." },
          { status: 400 }
        );
      }
      amountPaise = PLAN_PRICE_PAISE[plan];
      notes = { userId, kind: "plan", plan };
      label = `Build_Core ${plan === "PRO" ? "Pro" : "Standard"} (30 days)`;
    } else if (body.action === "TOKENS") {
      const count = Math.floor(Number(body.tokens));
      if (!Number.isFinite(count) || count < 1 || count > MAX_TOPUP) {
        return NextResponse.json(
          { error: `Token amount must be between 1 and ${MAX_TOPUP}.` },
          { status: 400 }
        );
      }
      amountPaise = TOKEN_PRICE_PAISE * count;
      notes = { userId, kind: "tokens", tokens: String(count) };
      label = `${count} extra Build_Core token${count > 1 ? "s" : ""}`;
    } else {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    // The amount is computed HERE from our own price table; the browser never sets it.
    const order = await razorpayCreateOrder({
      amountPaise,
      receipt: `u${userId.slice(0, 8)}_${Date.now()}`,
      notes,
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID!.trim(),
      name: "Build_Core",
      description: label,
      prefill: { name: user.name ?? "", email: user.email },
    });
  } catch (err) {
    console.error("RAZORPAY ORDER ERROR:", err);
    return NextResponse.json({ error: "Could not start the payment. Please try again." }, { status: 500 });
  }
}
