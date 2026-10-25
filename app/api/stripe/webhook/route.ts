import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe";
import { processStripeEvent, type StripeEvent } from "@/lib/stripe-webhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 501 });
  }

  // The signature is computed over the RAW body, so read it as text (not req.json()).
  const rawBody = await req.text();
  if (!verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const result = await processStripeEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (err) {
    console.error("STRIPE WEBHOOK ERROR:", event.type, err);
    // 500 => Stripe retries later with the same event id.
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}
