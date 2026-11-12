import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isDebugAdmin } from "@/lib/debug-agent";
import { createInvite } from "@/lib/tester";
import type { Tier } from "@/lib/plans";

async function guard() {
  const session = await auth();
  if (!session?.user?.id) return { res: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  if (!isDebugAdmin(session.user.email)) return { res: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  return { email: session.user.email as string };
}

export async function GET() {
  const g = await guard();
  if (g.res) return g.res;
  const invites = await db.testerInvite.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, label: true, tier: true, tokens: true, accessDays: true,
      maxUses: true, uses: true, expiresAt: true, revokedAt: true, createdAt: true,
    },
  });
  return NextResponse.json({ invites });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g.res) return g.res;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.action === "revoke") {
    if (typeof body.id !== "string") return NextResponse.json({ error: "Missing id." }, { status: 400 });
    await db.testerInvite.updateMany({ where: { id: body.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  const { invite, token } = await createInvite({
    label: String(body.label ?? ""),
    tier: body.tier as Tier | undefined,
    tokens: body.tokens as number,
    accessDays: body.accessDays as number,
    maxUses: body.maxUses as number,
    linkValidDays: body.linkValidDays as number,
    createdBy: g.email!,
  });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return NextResponse.json({ id: invite.id, link: `${origin}/tester?code=${token}` });
}