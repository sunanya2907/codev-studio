import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "../../../lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const history = await db.generationHistory.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ history });
  } catch (error: any) {
    console.error("FETCH HISTORY ERROR:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch history." }, { status: 500 });
  }
}