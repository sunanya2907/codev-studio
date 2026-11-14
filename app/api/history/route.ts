import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { reconcileStaleBuilds } from "@/lib/builds";
import { STANDARD_PRICE_LABEL } from "@/lib/plans";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic"; // per-user data: never cached
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // A build whose server was killed is closed here and its token returned.
    await reconcileStaleBuilds(userId);

    // ?light=1 : only status fields (used to poll a running build without downloading code)
    if (new URL(request.url).searchParams.get("light") === "1") {
      const rows = await db.generationHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, status: true, error: true, createdAt: true, prompt: true },
      });
      return NextResponse.json({ history: rows });
    }

    const me = await db.user.findUnique({ where: { id: userId }, select: { tier: true } });

    const rows = await db.generationHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50, // each row stores several large code blobs - don't send unbounded history
    });

    const LOCKED = `// Locked on Free Plan. Upgrade to Standard (${STANDARD_PRICE_LABEL}) to view, edit and export the code.`;
    const history =
      me?.tier === "FREE"
        ? rows.map((r: any) => ({ ...r, spec: LOCKED, backend: LOCKED, database: LOCKED, qa: LOCKED, flow: LOCKED }))
        : rows;

    return NextResponse.json({ history });
  } catch (error: unknown) {
    console.error("FETCH HISTORY ERROR:", error);
    return NextResponse.json({ error: "Failed to fetch history." }, { status: 500 });
  }
}
