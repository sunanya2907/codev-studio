// Single source of truth for plans and token costs.
// (Previously the allowances were duplicated in billing, the editor and the pricing page.)

export type Tier = "FREE" | "STANDARD" | "PRO" | "EXCLUSIVE";

export const TIER_RANK: Record<Tier, number> = {
  FREE: 0,
  STANDARD: 1,
  PRO: 2,
  EXCLUSIVE: 3,
};

/** Tokens a plan includes per billing month. */
export const TIER_TOKENS: Record<Tier, number> = {
  FREE: 3,
  STANDARD: 10,
  PRO: 50,
  EXCLUSIVE: 250,
};

/** A full 5-agent build. */
export const BUILD_COST = 1;

/** Re-running a single agent with a custom instruction (one AI call). */
export const CUSTOMIZE_COST = 1;

/** Monthly subscription prices in US cents (charged through Stripe Checkout). */
export const PLAN_PRICE_CENTS: Record<"STANDARD" | "PRO", number> = {
  STANDARD: 900,
  PRO: 4900,
};

/** One extra token. */
export const TOKEN_PRICE_CENTS = 100;
export const MAX_TOPUP = 500;

/**
 * Razorpay prices in INR paise (Razorpay's smallest unit). Razorpay is one-time pay:
 * a plan purchase gives PLAN_DURATION_DAYS of access, and the user pays again to renew.
 */
export const PLAN_PRICE_PAISE: Record<"STANDARD" | "PRO", number> = {
  STANDARD: 79900, // Rs 799
  PRO: 399900, // Rs 3,999
};
export const TOKEN_PRICE_PAISE = 9900; // Rs 99 per extra token
export const PLAN_DURATION_DAYS = 30;

// ---- Voice ($0.25 per minute, paid with tokens) --------------------------------------
/** Voice price in US cents per minute. */
export const VOICE_PRICE_CENTS_PER_MIN = 25;
/** One token ($1) buys this many seconds of voice (240 s = 4 minutes at $0.25/min). */
export const VOICE_SECONDS_PER_TOKEN = Math.round(
  (TOKEN_PRICE_CENTS / VOICE_PRICE_CENTS_PER_MIN) * 60
);
/** A session may not go silent (no billing tick / turn) for longer than this. */
export const VOICE_MAX_GAP_SECONDS = 45;

export type PaymentProvider = "stripe" | "razorpay";
