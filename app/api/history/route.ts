import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { tier: true },
    });

    const rows = await db.generationHistory.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50, // each row stores several large code blobs - don't send unbounded history
    });

    const LOCKED = "// Locked on Free Plan. Upgrade to view, edit and export the code.";
    const history =
      me?.tier === "FREE"
        ? rows.map((r: any) => ({ ...r, spec: LOCKED, backend: LOCKED, database: LOCKED, qa: LOCKED }))
        : rows;

    return NextResponse.json({ history });
  } catch (error: unknown) {
    console.error("FETCH HISTORY ERROR:", error);
    return NextResponse.json({ error: "Failed to fetch history." }, { status: 500 });
  }
}
