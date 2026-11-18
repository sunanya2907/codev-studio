import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminGuard } from "@/lib/admin";
import { logAdminAction } from "@/lib/activity";
import { clampInt, isTier } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";

// One person, everything about them: profile, where they logged in from, what they did, builds, tester links, requests.
export async function GET(req: Request) {
  const g = await adminGuard();
  if (g.res) return g.res;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, image: true, tier: true, tokenBalance: true, voiceSeconds: true,
      planExpiresAt: true, tokenPeriodStart: true, termsAccepted: true, termsAcceptedAt: true, emailVerified: true,
      createdAt: true, lastLoginAt: true, lastLogoutAt: true, lastIp: true, lastCountry: true, lastCity: true,
      loginCount: true, blockedAt: true, blockedReason: true, password: true,
      stripeCustomerId: true, stripeSubscriptionId: true,
    },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const { password, stripeCustomerId, stripeSubscriptionId, ...safe } = user;

  const [accounts, logins, activity, builds, buildStats, redemptions, requests, actions, payments, voice] = await Promise.all([
    db.account.findMany({ where: { userId: id }, select: { provider: true } }),
    db.loginEvent.findMany({ where: { OR: [{ userId: id }, { email: user.email }] }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.userActivity.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 150 }),
    db.generationHistory.findMany({
      where: { userId: id }, orderBy: { createdAt: "desc" }, take: 25,
      select: { id: true, prompt: true, status: true, cost: true, error: true, createdAt: true },
    }),
    db.generationHistory.groupBy({ by: ["status"], where: { userId: id }, _count: { _all: true }, _sum: { cost: true } }),
    db.testerRedemption.findMany({
      where: { userId: id }, orderBy: { redeemedAt: "desc" },
      select: { redeemedAt: true, invite: { select: { label: true, tier: true, tokens: true, accessDays: true } } },
    }),
    db.accessRequest.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.adminAction.findMany({ where: { targetUserId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.razorpayPayment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.voiceSession.aggregate({ where: { userId: id }, _count: { _all: true }, _sum: { secondsBilled: true } }),
  ]);

  // Where did this person sign in from? One row per IP address.
  const ips = new Map<string, { ip: string; country: string | null; city: string | null; device: string | null; count: number; lastSeen: Date }>();
  for (const l of logins) {
    if (l.type !== "LOGIN" || !l.ip) continue;
    const cur = ips.get(l.ip);
    if (cur) cur.count += 1;
    else ips.set(l.ip, { ip: l.ip, country: l.country, city: l.city, device: l.device, count: 1, lastSeen: l.createdAt });
  }

  const stat = Object.fromEntries(buildStats.map((b) => [b.status, { n: b._count._all, tokens: b._sum.cost ?? 0 }]));
  return NextResponse.json({
    user: { ...safe, verified: !!safe.emailVerified, hasPassword: !!password, hasStripe: !!stripeCustomerId || !!stripeSubscriptionId },
    providers: accounts.map((a) => a.provider),
    stats: {
      builds: buildStats.reduce((n, b) => n + b._count._all, 0),
      done: stat.DONE?.n ?? 0,
      failed: stat.FAILED?.n ?? 0,
      tokensSpentOnBuilds: (stat.DONE?.tokens ?? 0) + (stat.BUILDING?.tokens ?? 0),
      voiceSessions: voice._count._all,
      voiceSeconds: voice._sum.secondsBilled ?? 0,
    },
    ips: [...ips.values()].sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()),
    logins, activity, builds, redemptions, requests, actions, payments,
  });
}

// { id, action: "grant_tokens", amount, reason } | { action: "set_tier", tier, days } | { action: "block", reason } | { action: "unblock" }
export async function POST(req: Request) {
  const g = await adminGuard();
  if (g.res) return g.res;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const user = id ? await db.user.findUnique({ where: { id }, select: { id: true, email: true, tier: true } }) : null;
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  switch (body.action) {
    case "grant_tokens": {
      const amount = clampInt(body.amount, -10000, 10000, 0);
      if (!amount) return NextResponse.json({ error: "Enter an amount other than 0." }, { status: 400 });
      if (amount > 0) {
        await db.user.update({ where: { id }, data: { tokenBalance: { increment: amount } } });
      } else {
        // removing tokens never goes below 0
        const r = await db.user.updateMany({ where: { id, tokenBalance: { gte: -amount } }, data: { tokenBalance: { increment: amount } } });
        if (r.count === 0) return NextResponse.json({ error: "The person has fewer tokens than that." }, { status: 409 });
      }
      await logAdminAction(g.email, "grant_tokens", id, `${amount > 0 ? "+" : ""}${amount} tokens${reason ? `: ${reason}` : ""}`);
      break;
    }
    case "set_tier": {
      if (!isTier(body.tier)) return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
      const days = clampInt(body.days, 1, 365, 30);
      await db.user.update({
        where: { id },
        data: body.tier === "FREE"
          ? { tier: "FREE", planExpiresAt: null }
          : { tier: body.tier, planExpiresAt: new Date(Date.now() + days * 86400000), tokenPeriodStart: new Date() },
      });
      await logAdminAction(g.email, "set_tier", id, `${user.tier} -> ${body.tier}${body.tier === "FREE" ? "" : ` for ${days} days`}${reason ? `: ${reason}` : ""}`);
      break;
    }
    case "block": {
      if (user.email.toLowerCase() === g.email.toLowerCase()) {
        return NextResponse.json({ error: "You cannot block yourself." }, { status: 400 });
      }
      await db.user.update({ where: { id }, data: { blockedAt: new Date(), blockedReason: reason || null } });
      await logAdminAction(g.email, "block", id, reason || "blocked");
      break;
    }
    case "unblock": {
      await db.user.update({ where: { id }, data: { blockedAt: null, blockedReason: null } });
      await logAdminAction(g.email, "unblock", id);
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const fresh = await db.user.findUnique({
    where: { id },
    select: { tier: true, tokenBalance: true, planExpiresAt: true, blockedAt: true, blockedReason: true },
  });
  return NextResponse.json({ ok: true, user: fresh });
}
