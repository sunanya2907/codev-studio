import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.user.update({
    where: { email: session.user.email },
    data: {
      termsAccepted: true,
      termsAcceptedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true });
}