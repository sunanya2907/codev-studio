import crypto from "node:crypto";

// Minimal Stripe client. It talks to Stripe's REST API directly (no `stripe` npm
// package needed) and verifies webhook signatures itself.

const API = "https://api.stripe.com/v1";

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY?.trim();

export class StripeError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

function encode(params: Params): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.append(key, String(value));
  }
  return body;
}

async function call<T>(method: "GET" | "POST", path: string, params: Params = {}): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new StripeError("STRIPE_SECRET_KEY is not set.", 501);

  const isGet = method === "GET";
  const qs = isGet && Object.keys(params).length ? `?${encode(params).toString()}` : "";
  const res = await fetch(`${API}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(isGet ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    body: isGet ? undefined : encode(params).toString(),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    throw new StripeError(data.error?.message || `Stripe error (${res.status}).`, res.status);
  }
  return data as T;
}

export const stripeGet = <T>(path: string, params?: Params) => call<T>("GET", path, params);
export const stripePost = <T>(path: string, params?: Params) => call<T>("POST", path, params);

/**
 * Verifies a `Stripe-Signature` header ("t=...,v1=...") against the RAW request body.
 * Rejects tampered payloads and replays older than `toleranceSec`.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  if (!header || !secret) return false;

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v;
    else if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(nowSec - Number(timestamp)) > toleranceSec) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "hex");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}
