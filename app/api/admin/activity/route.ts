import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { adminGuard, pageParams, usersById } from "@/lib/admin";

export const dynamic = "force-dynamic";

// What people did and typed (builds, searches, voice, tester links ...). ?kind= ?q= ?userId= ?page=
export async function GET(req: Request) {
  const g = await adminGuard();
  if (g.res) return g.res;
  const url = new URL(req.url);
  const { page, size, skip, take } = pageParams(url, 30);
  const kind = (url.searchParams.get("kind") || "").trim();
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const userId = (url.searchParams.get("userId") || "").trim();

  // Searching by email: find the matching users first, then filter the activity by their ids.
  let emailIds: string[] | null = null;
  if (q) {
    const hit = await db.user.findMany({ where: { email: { contains: q } }, select: { id: true }, take: 50 });
    emailIds = hit.map((u) => u.id);
  }
  const where: Prisma.UserActivityWhereInput = {
    ...(kind ? { kind } : {}),
    ...(userId ? { userId } : {}),
    ...(q ? { OR: [{ detail: { contains: q } }, { ip: { contains: q } }, { city: { contains: q } }, ...(emailIds?.length ? [{ userId: { in: emailIds } }] : [])] } : {}),
  };
  const [total, rows, kinds] = await Promise.all([
    db.userActivity.count({ where }),
    db.userActivity.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.userActivity.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);
  const names = await usersById(rows.map((r) => r.userId));
  return NextResponse.json({
    total, page, size,
    kinds: kinds.map((k) => ({ kind: k.kind, n: k._count._all })),
    rows: rows.map((r) => ({ ...r, email: names.get(r.userId)?.email ?? "(deleted user)" })),
  });
}
