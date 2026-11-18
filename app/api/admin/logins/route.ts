import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { adminGuard, pageParams } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Every login, logout and failed login with IP, country, city and device. ?type= ?q= ?page=
export async function GET(req: Request) {
  const g = await adminGuard();
  if (g.res) return g.res;
  const url = new URL(req.url);
  const { page, size, skip, take } = pageParams(url, 30);
  const type = (url.searchParams.get("type") || "").trim();
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);

  const where: Prisma.LoginEventWhereInput = {
    ...(["LOGIN", "LOGOUT", "LOGIN_FAILED"].includes(type) ? { type } : {}),
    ...(q ? { OR: [{ email: { contains: q } }, { ip: { contains: q } }, { city: { contains: q } }, { country: { contains: q } }, { device: { contains: q } }] } : {}),
  };
  const d1 = new Date(Date.now() - 86400000);
  const [total, rows, counts] = await Promise.all([
    db.loginEvent.count({ where }),
    db.loginEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.loginEvent.groupBy({ by: ["type"], where: { createdAt: { gte: d1 } }, _count: { _all: true } }),
  ]);
  return NextResponse.json({
    total, page, size,
    last24h: Object.fromEntries(counts.map((c) => [c.type, c._count._all])),
    rows,
  });
}
