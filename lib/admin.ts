import "server-only";
// One guard for every /api/admin/* route and the /admin layout.
// Admins are the emails in ADMIN_EMAILS (comma separated). In development, any signed-in user is an admin
// (same rule as the existing debug dashboard, see isDebugAdmin in lib/debug-agent.ts).
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDebugAdmin } from "@/lib/debug-agent";
import { db } from "@/lib/db";

export type AdminGuard = { email: string; res?: undefined } | { res: NextResponse; email?: undefined };

export async function adminGuard(): Promise<AdminGuard> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return { res: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  }
  if (!isDebugAdmin(session.user.email)) {
    return { res: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }
  return { email: session.user.email };
}

/** Parse ?page=&size= safely. */
export function pageParams(url: URL, defaultSize = 25, maxSize = 100) {
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page"))) || 1);
  const size = Math.min(maxSize, Math.max(1, Math.floor(Number(url.searchParams.get("size"))) || defaultSize));
  return { page, size, skip: (page - 1) * size, take: size };
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Last `days` calendar days (UTC) as [{ day: "2026-11-18", n: 0 }, ...], oldest first. */
export function emptyDays(days: number) {
  const out: { day: string; n: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) out.push({ day: dayKey(new Date(today.getTime() - i * 86400000)), n: 0 });
  return out;
}

export function bucketByDay(dates: Date[], days: number) {
  const series = emptyDays(days);
  const idx = new Map(series.map((s, i) => [s.day, i]));
  for (const d of dates) {
    const i = idx.get(dayKey(d));
    if (i !== undefined) series[i].n += 1;
  }
  return series;
}

/** email / name for a list of user ids (logs keep plain ids, so the dashboard joins them here). */
export async function usersById(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map<string, { id: string; email: string; name: string | null; tier: string; blockedAt: Date | null }>();
  const rows = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true, name: true, tier: true, blockedAt: true },
  });
  return new Map(rows.map((u) => [u.id, u]));
}
