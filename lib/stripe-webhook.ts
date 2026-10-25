import { db } from "@/lib/db";
import { MAX_TOPUP, TIER_RANK, TIER_TOKENS, type Tier } from "@/lib/plans";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type StripeEvent = { id: string; type: string; data: { object: any } };

const PAID: Tier[] = ["STANDARD", "PRO", "EXCLUSIVE"];
const isPaidTier = (v: unknown): v is Tier => PAID.includes(v as Tier);
const idOf = (v: any): string | undefined =>
  typeof v === "string" ? v : typeof v?.id === "string" ? v.id : undefined;

async function findUser(tx: any, opts: { userId?: string; customerId?: string }) {
  if (opts.userId) {
    const u = await tx.user.findUnique({ where: { id: opts.userId } });
    if (u) return u;
  }
  if (opts.customerId) {
    return tx.user.findFirst({ where: { stripeCustomerId: opts.customerId } });
  }
  return null;
}

async function applyEvent(tx: any, event: StripeEvent) {
  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const user = await findUser(tx, {
        userId: obj.client_reference_id || obj.metadata?.userId,
        customerId: idOf(obj.customer),
      });
      if (!user) return;

      if (obj.mode === "subscription") {
        const plan = obj.metadata?.plan;
        if (!isPaidTier(plan) || obj.payment_status === "unpaid") return;
        await tx.user.update({
          where: { id: user.id },
          data: {
            tier: plan,
            planExpiresAt: null,
            tokenBalance: Math.max(user.tokenBalance, TIER_TOKENS[plan as Tier]),
            tokenPeriodStart: new Date(),
            stripeCustomerId: idOf(obj.customer) ?? user.stripeCustomerId,
            stripeSubscriptionId: idOf(obj.subscription) ?? user.stripeSubscriptionId,
          },
        });
      } else if (obj.mode === "payment" && obj.metadata?.kind === "tokens") {
        if (obj.payment_status !== "paid") return; // async methods: wait for async_payment_succeeded
        const count = Math.floor(Number(obj.metadata?.tokens));
        if (!Number.isFinite(count) || count < 1 || count > MAX_TOPUP) return;
        await tx.user.update({
          where: { id: user.id },
          data: {
            tokenBalance: { increment: count },
            stripeCustomerId: user.stripeCustomerId ?? idOf(obj.customer),
          },
        });
      }
      return;
    }

    // Monthly renewal paid => start a new token period and refill to the plan allowance.
    case "invoice.paid": {
      if (obj.billing_reason !== "subscription_cycle") return;
      const user = await findUser(tx, { customerId: idOf(obj.customer) });
      if (!user || !isPaidTier(user.tier)) return;
      await tx.user.update({
        where: { id: user.id },
        data: {
          tokenBalance: Math.max(user.tokenBalance, TIER_TOKENS[user.tier as Tier]),
          tokenPeriodStart: new Date(),
        },
      });
      return;
    }

    case "customer.subscription.updated": {
      const user = await findUser(tx, {
        userId: obj.metadata?.userId,
        customerId: idOf(obj.customer),
      });
      if (!user) return;

      if (["canceled", "unpaid", "incomplete_expired"].includes(obj.status)) {
        await tx.user.update({
          where: { id: user.id },
          data: { tier: "FREE", stripeSubscriptionId: null },
        });
        return;
      }
      const plan = obj.metadata?.plan;
      if (["active", "trialing"].includes(obj.status) && isPaidTier(plan) && plan !== user.tier) {
        const upgrading = TIER_RANK[plan as Tier] > TIER_RANK[user.tier as Tier];
        await tx.user.update({
          where: { id: user.id },
          data: {
            tier: plan,
            stripeSubscriptionId: obj.id,
            ...(upgrading
              ? { tokenBalance: Math.max(user.tokenBalance, TIER_TOKENS[plan as Tier]) }
              : {}),
          },
        });
      }
      return;
    }

    case "customer.subscription.deleted": {
      const user = await findUser(tx, {
        userId: obj.metadata?.userId,
        customerId: idOf(obj.customer),
      });
      if (!user) return;
      // Subscription over: back to Free (remaining tokens are kept, they were paid for).
      await tx.user.update({
        where: { id: user.id },
        data: { tier: "FREE", stripeSubscriptionId: null },
      });
      return;
    }

    default:
      return;
  }
}

/**
 * Processes one verified Stripe event exactly once. The event id is stored in the same
 * transaction as its effects, so a retry of an already-handled event is a no-op, and an
 * event whose handling failed is rolled back completely (Stripe will retry it).
 */
export async function processStripeEvent(
  event: StripeEvent
): Promise<"processed" | "duplicate"> {
  try {
    await db.$transaction(async (tx: any) => {
      await tx.stripeEvent.create({ data: { id: event.id, type: event.type } });
      await applyEvent(tx, event);
    });
    return "processed";
  } catch (err: any) {
    if (err?.code === "P2002") return "duplicate";
    throw err;
  }
}
