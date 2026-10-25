import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { grantRazorpayPayment } from "@/lib/razorpay-grant";
import { verifyCheckoutSignature } from "@/lib/razorpay";

// Called by the browser right after Razorpay Checkout succeeds. The webhook is the
// backup in case the user closes the tab before this runs; both are idempotent.
export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const orderId = String(b.razorpay_order_id || "");
    const paymentId = String(b.razorpay_payment_id || "");
    const signature = String(b.razorpay_signature || "");

    if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
      return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
    }

    // Fetch the order's notes from Razorpay (trusted) instead of believing the browser.
    const id = process.env.RAZORPAY_KEY_ID!.trim();
    const secret = process.env.RAZORPAY_KEY_SECRET!.trim();
    const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    });
    const order = await res.json();
    if (!res.ok || order.status !== "paid" || order.notes?.userId !== userId) {
      return NextResponse.json({ error: "Order not paid or not yours." }, { status: 400 });
    }

    const result = await grantRazorpayPayment({ paymentId, orderId, notes: order.notes });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("RAZORPAY VERIFY ERROR:", err);
    return NextResponse.json({ error: "Verification failed. If you were charged, it will be applied shortly." }, { status: 500 });
  }
}
