import crypto from "node:crypto";

// Minimal Razorpay client (REST + signature checks); no `razorpay` npm package needed.
const API = "https://api.razorpay.com/v1";

export const razorpayConfigured = () =>
  !!process.env.RAZORPAY_KEY_ID?.trim() && !!process.env.RAZORPAY_KEY_SECRET?.trim();

export async function razorpayCreateOrder(params: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const id = process.env.RAZORPAY_KEY_ID!.trim();
  const secret = process.env.RAZORPAY_KEY_SECRET!.trim();
  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt.slice(0, 40),
      notes: params.notes,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay error (${res.status}).`);
  return data;
}

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/** Checks the signature Razorpay Checkout returns to the browser after payment. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Checks the `X-Razorpay-Signature` header of a webhook against the RAW body. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
