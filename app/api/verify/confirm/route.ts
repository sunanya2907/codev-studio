import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { MAX_ATTEMPTS, codeMatches, isExpired, normalizeCode } from "@/lib/verify-core";

export const dynamic = "force-dynamic";

const pepper = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "build-core";

/** Checks the 6-digit code. A correct code marks the email as verified. */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const u = session?.user as { id?: string; pendingId?: string } | undefined;
    const userId = u?.id ?? u?.pendingId;
    if (!userId) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

    let body: { code?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const code = normalizeCode(body.code);
    if (!code) return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });

    const rec = await db.emailVerification.findUnique({ where: { userId } });
    if (!rec) return NextResponse.json({ error: "No code was sent yet. Press Resend code.", code: "NO_CODE" }, { status: 400 });
    if (isExpired(rec.expiresAt)) {
      await db.emailVerification.deleteMany({ where: { userId } });
      return NextResponse.json({ error: "This code has expired. Press Resend code.", code: "EXPIRED" }, { status: 400 });
    }

    // Use up one attempt BEFORE comparing, atomically, so parallel guesses cannot beat the limit.
    const claimed = await db.emailVerification.updateMany({
      where: { userId, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      await db.emailVerification.deleteMany({ where: { userId } });
      return NextResponse.json({ error: "Too many wrong codes. Press Resend code to get a new one.", code: "LOCKED" }, { status: 429 });
    }

    if (!codeMatches(rec.codeHash, userId, code, pepper())) {
      const left = MAX_ATTEMPTS - (rec.attempts + 1);
      return NextResponse.json(
        { error: left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code is not right. Press Resend code to get a new one.", code: "WRONG" },
        { status: 400 }
      );
    }

    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } }),
      db.emailVerification.deleteMany({ where: { userId } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("VERIFY CONFIRM ERROR:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
