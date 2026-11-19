import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { adminGuard, pageParams } from "@/lib/admin";
import { isTier } from "@/lib/admin-actions";
import { verificationEnabled } from "@/lib/email-verify";

export const dynamic = "force-dynamic";

const SORTS: Record<string, Prisma.UserOrderByWithRelationInput> = {
  newest: { createdAt: "desc" },
  lastLogin: { lastLoginAt: "desc" },
  tokens: { tokenBalance: "desc" },
  logins: { loginCount: "desc" },
};

// Searchable, filterable, paged list of every user. Never returns the password hash.
export async function GET(req: Request) {
  const g = await adminGuard();
  if (g.res) return g.res;
  const url = new URL(req.url);
  const { page, size, skip, take } = pageParams(url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const tier = url.searchParams.get("tier");
  const status = url.searchParams.get("status");
  const sort = SORTS[url.searchParams.get("sort") || ""] ?? SORTS.newest;

  const where: Prisma.UserWhereInput = {
    ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }, { lastIp: { contains: q } }] } : {}),
    ...(isTier(tier) ? { tier } : {}),
    ...(status === "blocked" ? { blockedAt: { not: null } } : status === "active" ? { blockedAt: null } : {}),
  };

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where, orderBy: sort, skip, take,
      select: {
        id: true, email: true, name: true, image: true, tier: true, tokenBalance: true, planExpiresAt: true,
        createdAt: true, lastLoginAt: true, lastLogoutAt: true, lastIp: true, lastCountry: true, lastCity: true,
        loginCount: true, blockedAt: true, emailVerified: true,
      },
    }),
  ]);
  const builds = await db.generationHistory.groupBy({
    by: ["userId"], where: { userId: { in: users.map((u) => u.id) } }, _count: { _all: true },
  });
  const buildMap = new Map(builds.map((b) => [b.userId, b._count._all]));
  return NextResponse.json({
    total, page, size,
    // false when EMAIL_SERVER / EMAIL_FROM are not set: nobody has to verify, so "unverified" means nothing
    verificationOn: verificationEnabled(),
    users: users.map((u) => ({ ...u, builds: buildMap.get(u.id) ?? 0, verified: !!u.emailVerified, emailVerified: undefined })),
  });
}
