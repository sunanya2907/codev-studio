import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminGuard, bucketByDay, usersById } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Everything on the dashboard front page, in one request.
export async function GET() {
  const g = await adminGuard();
  if (g.res) return g.res;

  const now = Date.now();
  const d1 = new Date(now - 86400000);
  const d7 = new Date(now - 7 * 86400000);
  const d14 = new Date(now - 14 * 86400000);
  const d30 = new Date(now - 30 * 86400000);

  const [
    totalUsers, new24, new7, new30, blocked, tierGroups, tokenSum,
    buildTotal, build7, buildStatus, buildTokens7, customizeTokens7,
    actUsers, loginUsers, logins24, failed24,
    signupRows, buildRows, loginRows,
    aiAgg, aiFail24,
    pendingRequests, errorGroups, invitesActive, redemptions,
    countries, recent, payments30,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: d1 } } }),
    db.user.count({ where: { createdAt: { gte: d7 } } }),
    db.user.count({ where: { createdAt: { gte: d30 } } }),
    db.user.count({ where: { blockedAt: { not: null } } }),
    db.user.groupBy({ by: ["tier"], _count: { _all: true } }),
    db.user.aggregate({ _sum: { tokenBalance: true } }),
    db.generationHistory.count(),
    db.generationHistory.count({ where: { createdAt: { gte: d7 } } }),
    db.generationHistory.groupBy({ by: ["status"], _count: { _all: true } }),
    db.generationHistory.aggregate({ where: { createdAt: { gte: d7 }, status: { not: "FAILED" } }, _sum: { cost: true } }),
    db.userActivity.aggregate({ where: { createdAt: { gte: d7 }, kind: "CUSTOMIZE" }, _sum: { tokens: true } }),
    db.userActivity.groupBy({ by: ["userId"], where: { createdAt: { gte: d1 } } }),
    db.loginEvent.groupBy({ by: ["userId"], where: { type: "LOGIN", createdAt: { gte: d1 }, userId: { not: null } } }),
    db.loginEvent.count({ where: { type: "LOGIN", createdAt: { gte: d1 } } }),
    db.loginEvent.count({ where: { type: "LOGIN_FAILED", createdAt: { gte: d1 } } }),
    db.user.findMany({ where: { createdAt: { gte: d14 } }, select: { createdAt: true }, take: 20000 }),
    db.generationHistory.findMany({ where: { createdAt: { gte: d14 } }, select: { createdAt: true }, take: 20000 }),
    db.loginEvent.findMany({ where: { type: "LOGIN", createdAt: { gte: d14 } }, select: { createdAt: true }, take: 20000 }),
    db.aiCallLog.aggregate({ where: { createdAt: { gte: d1 } }, _count: { _all: true }, _avg: { ms: true }, _sum: { tokensIn: true, tokensOut: true } }),
    db.aiCallLog.count({ where: { createdAt: { gte: d1 }, ok: false } }),
    db.accessRequest.count({ where: { status: "PENDING" } }),
    db.errorLog.groupBy({ by: ["status"], _count: { _all: true } }),
    db.testerInvite.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.testerRedemption.count(),
    db.loginEvent.groupBy({
      by: ["country"],
      where: { type: "LOGIN", createdAt: { gte: d30 }, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 8,
    }),
    db.userActivity.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    db.razorpayPayment.count({ where: { createdAt: { gte: d30 } } }),
  ]);

  const names = await usersById(recent.map((r) => r.userId));
  const status = Object.fromEntries(buildStatus.map((b) => [b.status, b._count._all]));
  const activeIds = new Set<string>([...actUsers.map((a) => a.userId), ...loginUsers.map((l) => l.userId as string)]);
  const errors = Object.fromEntries(errorGroups.map((e) => [e.status, e._count._all]));

  return NextResponse.json({
    users: {
      total: totalUsers, new24h: new24, new7d: new7, new30d: new30, blocked,
      active24h: activeIds.size,
      tiers: Object.fromEntries(tierGroups.map((t) => [t.tier, t._count._all])),
    },
    tokens: {
      inCirculation: tokenSum._sum.tokenBalance ?? 0,
      spent7d: (buildTokens7._sum.cost ?? 0) + (customizeTokens7._sum.tokens ?? 0),
    },
    builds: { total: buildTotal, last7d: build7, done: status.DONE ?? 0, failed: status.FAILED ?? 0, running: status.BUILDING ?? 0 },
    logins: { last24h: logins24, failed24h: failed24 },
    ai: {
      calls24h: aiAgg._count._all,
      failed24h: aiFail24,
      avgMs: Math.round(aiAgg._avg.ms ?? 0),
      tokensIn24h: aiAgg._sum.tokensIn ?? 0,
      tokensOut24h: aiAgg._sum.tokensOut ?? 0,
    },
    requests: { pending: pendingRequests },
    errors: { open: (errors.NEW ?? 0) + (errors.ANALYZING ?? 0) + (errors.DIAGNOSED ?? 0) + (errors.FAILED ?? 0) },
    testers: { activeLinks: invitesActive, redemptions },
    payments30d: payments30,
    series: {
      signups: bucketByDay(signupRows.map((r) => r.createdAt), 14),
      builds: bucketByDay(buildRows.map((r) => r.createdAt), 14),
      logins: bucketByDay(loginRows.map((r) => r.createdAt), 14),
    },
    countries: countries.map((c) => ({ country: c.country, n: c._count._all })),
    recent: recent.map((r) => ({
      id: r.id, kind: r.kind, detail: r.detail, tokens: r.tokens, country: r.country, city: r.city, createdAt: r.createdAt,
      user: names.get(r.userId)?.email ?? "(deleted user)", userId: r.userId,
    })),
  });
}
