import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { grantRazorpayPayment } from "@/lib/razorpay-grant";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 501 });

  const rawBody = await req.text();
  if (!verifyWebhookSignature(rawBody, req.headers.get("x-razorpay-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody);
    // order.paid carries both the order (with our notes) and the payment.
    if (event.event === "order.paid") {
      const order = event.payload?.order?.entity;
      const payment = event.payload?.payment?.entity;
      if (order && payment) {
        await grantRazorpayPayment({ paymentId: payment.id, orderId: order.id, notes: order.notes });
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("RAZORPAY WEBHOOK ERROR:", err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 }); // Razorpay retries
  }
}
