import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminGuard } from "@/lib/admin";
import { logAdminAction } from "@/lib/activity";
import { clampInt, grantAccess, isTier } from "@/lib/admin-actions";
import type { Tier } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await adminGuard();
  if (g.res) return g.res;
  const status = new URL(req.url).searchParams.get("status") || "PENDING";
  const where = ["PENDING", "ACCEPTED", "REJECTED"].includes(status) ? { status } : {};
  const [rows, counts] = await Promise.all([
    db.accessRequest.findMany({ where, orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" }, take: 100 }),
    db.accessRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const ids = [...new Set(rows.map((r) => r.userId))];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, tier: true, tokenBalance: true, lastCountry: true, lastCity: true, lastLoginAt: true, createdAt: true },
  });
  const map = new Map(users.map((u) => [u.id, u]));
  return NextResponse.json({
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    requests: rows.map((r) => ({ ...r, user: map.get(r.userId) ?? null })),
  });
}

// { id, decision: "accept" | "reject", tier?, tokens?, days?, note? }
// Accepting grants what the admin typed (default per type); rejecting just records the note.
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
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
  const request = id ? await db.accessRequest.findUnique({ where: { id } }) : null;
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (request.status !== "PENDING") return NextResponse.json({ error: "This request was already decided." }, { status: 409 });

  if (body.decision === "reject") {
    const r = await db.accessRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", adminNote: note, decidedBy: g.email, decidedAt: new Date() },
    });
    if (r.count === 0) return NextResponse.json({ error: "This request was already decided." }, { status: 409 });
    await logAdminAction(g.email, "reject_request", request.userId, `${request.type}${note ? `: ${note}` : ""}`);
    return NextResponse.json({ ok: true });
  }
  if (body.decision !== "accept") return NextResponse.json({ error: "Unknown decision." }, { status: 400 });

  const tier: Tier | null = isTier(body.tier) && body.tier !== "FREE" ? body.tier : null;
  const tokens = clampInt(body.tokens, 0, 500, 0);
  const days = clampInt(body.days, 1, 365, 14);
  if (!tier && tokens === 0) return NextResponse.json({ error: "Choose a plan, some tokens, or both." }, { status: 400 });

  try {
    await db.$transaction(async (tx) => {
      // claim first: two admins clicking at once can never grant twice
      const claimed = await tx.accessRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "ACCEPTED", adminNote: note, decidedBy: g.email, decidedAt: new Date(), grantTier: tier, grantTokens: tokens, grantDays: tier ? days : 0 },
      });
      if (claimed.count === 0) throw new Error("ALREADY_DECIDED");
      await grantAccess(tx, request.userId, { tier, tokens, days });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_DECIDED") {
      return NextResponse.json({ error: "This request was already decided." }, { status: 409 });
    }
    console.error("ACCEPT REQUEST FAILED:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not accept the request." }, { status: 500 });
  }
  await logAdminAction(g.email, "accept_request", request.userId, `${request.type}: ${tier ?? "no plan"}, +${tokens} tokens${tier ? `, ${days} days` : ""}`);
  return NextResponse.json({ ok: true });
}
