import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { redeemInvite } from "@/lib/tester";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";

  try {
    const r = await redeemInvite(userId, code);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (e) {
    console.error("TESTER REDEEM ERROR:", e);
    return NextResponse.json({ error: "Could not redeem the link." }, { status: 500 });
  }
}
