import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { MAX_TOPUP, PLAN_PRICE_CENTS, TOKEN_PRICE_CENTS } from "@/lib/plans";
import { StripeError, stripeConfigured, stripeGet, stripePost } from "@/lib/stripe";

type PaidPlan = "STANDARD" | "PRO";
const PLAN_NAMES: Record<PaidPlan, string> = {
  STANDARD: "Build_Core Standard Plan",
  PRO: "Build_Core Pro Plan",
};

const url = (u: unknown) => (typeof u === "string" ? u : "");

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    if (!stripeConfigured()) {
      return NextResponse.json(
        { error: "Payments are not configured.", code: "STRIPE_NOT_CONFIGURED" },
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
      select: {
        id: true,
        email: true,
        tier: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin;
    const customerParams = user.stripeCustomerId
      ? { customer: user.stripeCustomerId }
      : { customer_email: user.email };

    // ---- Manage / cancel subscription, invoices, card ---------------------------------
    if (body.action === "PORTAL") {
      if (!user.stripeCustomerId) {
        return NextResponse.json({ error: "No billing account yet." }, { status: 400 });
      }
      const portal = await stripePost<{ url: string }>("/billing_portal/sessions", {
        customer: user.stripeCustomerId,
        return_url: `${origin}/orchestrate`,
      });
      return NextResponse.json({ url: portal.url });
    }

    // ---- Monthly plan -----------------------------------------------------------------
    if (body.action === "PLAN") {
      const plan = body.plan;
      if (plan !== "STANDARD" && plan !== "PRO") {
        return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
      }

      // Already subscribed => switch the existing subscription instead of creating a second one.
      if (user.stripeSubscriptionId) {
        if (user.tier === plan) {
          return NextResponse.json({ error: `You are already on the ${plan} plan.` }, { status: 400 });
        }
        const sub = await stripeGet<{ items: { data: { id: string }[] } }>(
          `/subscriptions/${user.stripeSubscriptionId}`
        );
        const product = await stripePost<{ id: string }>("/products", { name: PLAN_NAMES[plan] });
        await stripePost(`/subscriptions/${user.stripeSubscriptionId}`, {
          "items[0][id]": sub.items.data[0].id,
          "items[0][price_data][currency]": "usd",
          "items[0][price_data][product]": product.id,
          "items[0][price_data][unit_amount]": PLAN_PRICE_CENTS[plan],
          "items[0][price_data][recurring][interval]": "month",
          "metadata[plan]": plan,
          "metadata[userId]": user.id,
          proration_behavior: "create_prorations",
        });
        // Plan/tokens are applied by the customer.subscription.updated webhook.
        return NextResponse.json({ switched: true });
      }

      const checkout = await stripePost<{ url: string }>("/checkout/sessions", {
        mode: "subscription",
        client_reference_id: user.id,
        ...customerParams,
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": PLAN_PRICE_CENTS[plan],
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][price_data][product_data][name]": PLAN_NAMES[plan],
        "metadata[userId]": user.id,
        "metadata[plan]": plan,
        "subscription_data[metadata][userId]": user.id,
        "subscription_data[metadata][plan]": plan,
        allow_promotion_codes: true,
        success_url: `${origin}/orchestrate?checkout=success`,
        cancel_url: `${origin}/orchestrate?checkout=cancelled`,
      });
      return NextResponse.json({ url: url(checkout.url) });
    }

    // ---- One-off $1 token top-up ------------------------------------------------------
    if (body.action === "TOKENS") {
      const count = Math.floor(Number(body.tokens));
      if (!Number.isFinite(count) || count < 1 || count > MAX_TOPUP) {
        return NextResponse.json(
          { error: `Token amount must be between 1 and ${MAX_TOPUP}.` },
          { status: 400 }
        );
      }
      const checkout = await stripePost<{ url: string }>("/checkout/sessions", {
        mode: "payment",
        client_reference_id: user.id,
        ...customerParams,
        ...(user.stripeCustomerId ? {} : { customer_creation: "always" }),
        "line_items[0][quantity]": count,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": TOKEN_PRICE_CENTS,
        "line_items[0][price_data][product_data][name]": "Build_Core extra token",
        "metadata[userId]": user.id,
        "metadata[kind]": "tokens",
        "metadata[tokens]": count,
        success_url: `${origin}/orchestrate?checkout=success`,
        cancel_url: `${origin}/orchestrate?checkout=cancelled`,
      });
      return NextResponse.json({ url: url(checkout.url) });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err) {
    console.error("STRIPE CHECKOUT ERROR:", err);
    const message =
      err instanceof StripeError ? err.message : "Could not start the payment. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
