import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const history = await db.generationHistory.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50, // each row stores several large code blobs - don't send unbounded history
    });

    return NextResponse.json({ history });
  } catch (error: unknown) {
    console.error("FETCH HISTORY ERROR:", error);
    return NextResponse.json({ error: "Failed to fetch history." }, { status: 500 });
  }
}
