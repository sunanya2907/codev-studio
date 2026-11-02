// The plan cards shown in the editor popup AND on /pricing. Every number comes from
// lib/plans.ts, so changing a price or allowance there updates every screen.
import {
  FREE_TRIAL_BUILDS,
  PLAN_PRICE_CENTS,
  TIER_TOKENS,
  TOKEN_PRICE_LABEL,
  usd,
  type Tier,
} from "@/lib/plans";

export type PlanDetail = {
  id: Tier;
  name: string;
  price: string;
  period: string;
  tokens: number;
  badge: string;
  tag?: string;
  desc: string;
  features: string[];
};

export const PLAN_DETAILS: PlanDetail[] = [
  {
    id: "FREE",
    name: "Free Plan",
    price: usd(0),
    period: "/ month",
    tokens: TIER_TOKENS.FREE,
    badge: `${FREE_TRIAL_BUILDS} Free Trial Builds`,
    desc: "Build and run your app in Live Preview. Code is locked.",
    features: [
      `${FREE_TRIAL_BUILDS} Free Trial Builds (one-time)`,
      "Live Preview of your app",
      "Locked: code view, copy, edit & export",
    ],
  },
  {
    id: "STANDARD",
    name: "Standard Plan",
    price: usd(PLAN_PRICE_CENTS.STANDARD),
    period: "/ month",
    tokens: TIER_TOKENS.STANDARD,
    badge: `${TIER_TOKENS.STANDARD} Tokens Included`,
    tag: "Best Value",
    desc: "Unlocks all 5 AI agents, full code access & ZIP Export.",
    features: [
      `${TIER_TOKENS.STANDARD} Monthly Generation Tokens`,
      "All 5 Full-Stack Agents Unlocked",
      "Full code access & ZIP Export",
      `${TOKEN_PRICE_LABEL} Extra Token Top-Ups Anytime`,
    ],
  },
  {
    id: "PRO",
    name: "Pro Plan",
    price: usd(PLAN_PRICE_CENTS.PRO),
    period: "/ month",
    tokens: TIER_TOKENS.PRO,
    badge: `${TIER_TOKENS.PRO} Tokens Included`,
    tag: "Popular",
    desc: "High-volume token allowance for power builders.",
    features: [
      `${TIER_TOKENS.PRO} Monthly Generation Tokens`,
      "All 5 Full-Stack Agents Unlocked",
      "Build history saved (latest 50 builds)",
      `${TOKEN_PRICE_LABEL} Extra Token Top-Ups Anytime`,
    ],
  },
  {
    id: "EXCLUSIVE",
    name: "Exclusive Plan",
    price: "Custom",
    period: "Monthly Billing",
    tokens: TIER_TOKENS.EXCLUSIVE,
    badge: `${TIER_TOKENS.EXCLUSIVE}+ Custom Tokens`,
    desc: "Custom agent customization & dedicated monthly billing.",
    features: [
      `${TIER_TOKENS.EXCLUSIVE}+ Custom Monthly Token Volume`,
      "Custom Agent System Rules & Prompts",
      "Consolidated Monthly Billing",
      `On-Demand ${TOKEN_PRICE_LABEL} Extra Token Top-Ups`,
    ],
  },
];
