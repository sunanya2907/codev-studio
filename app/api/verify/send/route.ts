import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sendVerificationEmail, verificationEnabled } from "@/lib/email-verify";
import { CODE_TTL_MS, RESEND_COOLDOWN_MS, cooldownLeftMs, hashCode, maskEmail, newCode } from "@/lib/verify-core";

export const dynamic = "force-dynamic";

const pepper = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "build-core";

/** Sends (or re-sends) the 6-digit code to the signed-in person's email address. */
export async function POST() {
  try {
    const session = await auth();
    // A person who has not verified yet has no `id` in the session, only `pendingId`.
    const u = session?.user as { id?: string; pendingId?: string } | undefined;
    const userId = u?.id ?? u?.pendingId;
    if (!userId) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    if (!verificationEnabled()) return NextResponse.json({ error: "Email verification is not set up." }, { status: 501 });

    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (user.emailVerified) return NextResponse.json({ ok: true, verified: true });

    const existing = await db.emailVerification.findUnique({ where: { userId } });
    const wait = existing ? cooldownLeftMs(existing.sentAt) : 0;
    if (wait > 0) {
      // Already sent a moment ago (also covers the page loading twice): do not send another email.
      return NextResponse.json({ ok: true, alreadySent: true, cooldownSeconds: Math.ceil(wait / 1000), email: maskEmail(user.email) });
    }

    const code = newCode();
    const data = { codeHash: hashCode(userId, code, pepper()), expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0, sentAt: new Date() };
    await db.emailVerification.upsert({ where: { userId }, create: { userId, ...data }, update: data });

    try {
      await sendVerificationEmail(user.email, code);
    } catch (e) {
      console.error("VERIFICATION EMAIL FAILED:", e instanceof Error ? e.message : e);
      await db.emailVerification.deleteMany({ where: { userId } }); // let them try again right away
      return NextResponse.json({ error: "We could not send the email. Please try again in a moment." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, cooldownSeconds: RESEND_COOLDOWN_MS / 1000, email: maskEmail(user.email) });
  } catch (err) {
    console.error("VERIFY SEND ERROR:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
