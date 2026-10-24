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

/** Re-running a single agent with a custom instruction (one Gemini call). */
export const CUSTOMIZE_COST = 1;
