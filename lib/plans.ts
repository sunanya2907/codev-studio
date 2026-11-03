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

// ---- Voice ($0.50 per minute, paid with tokens) --------------------------------------
/** Voice price in US cents per minute. */
export const VOICE_PRICE_CENTS_PER_MIN = 50;
/** One token ($1) buys this many seconds of voice (120 s = 2 minutes at $0.50/min). */
export const VOICE_SECONDS_PER_TOKEN = Math.round(
  (TOKEN_PRICE_CENTS / VOICE_PRICE_CENTS_PER_MIN) * 60
);
/** Label such as "1 token = 2 minutes", used in the UI. */
export const VOICE_TOKEN_LABEL = `1 token = ${VOICE_SECONDS_PER_TOKEN / 60} min`;
/** Price label such as "$0.50/min". */
export const VOICE_PRICE_LABEL = `$${(VOICE_PRICE_CENTS_PER_MIN / 100).toFixed(2)}/min`;
/** A session may not go silent (no billing tick / turn) for longer than this. */
export const VOICE_MAX_GAP_SECONDS = 45;

export type PaymentProvider = "stripe" | "razorpay";

// ---- Display helpers: every price in the UI and in server messages comes from here ----
export const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
export const inr = (paise: number) => `\u20B9${(paise / 100).toLocaleString("en-IN")}`;
export const STANDARD_PRICE_LABEL = usd(PLAN_PRICE_CENTS.STANDARD);
export const PRO_PRICE_LABEL = usd(PLAN_PRICE_CENTS.PRO);
export const TOKEN_PRICE_LABEL = usd(TOKEN_PRICE_CENTS);
export const FREE_TRIAL_BUILDS = TIER_TOKENS.FREE;
