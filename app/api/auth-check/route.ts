import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Open /api/auth-check to see exactly who this browser is logged in as and why.
 * It shows only your own data and cookie NAMES (never cookie values or secrets).
 */
export async function GET() {
  const session = await auth();
  const jar = await cookies();
  const cookieNames = jar.getAll().map((c) => c.name).filter((n) => /authjs|next-auth/i.test(n));

  let dbUser: { id: string; email: string; name: string | null } | null = null;
  let linkedAccounts: { provider: string }[] = [];
  if (session?.user?.id) {
    try {
      dbUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true },
      });
      linkedAccounts = await db.account.findMany({
        where: { userId: session.user.id },
        select: { provider: true },
      });
    } catch {}
  }

  const urlOf = (v?: string) => {
    try {
      return v ? new URL(v).host : null;
    } catch {
      return v ? "invalid" : null;
    }
  };

  return NextResponse.json({
    signedIn: !!session?.user,
    sessionEmail: session?.user?.email ?? null,
    sessionUserId: session?.user?.id ?? null,
    dbUser,
    linkedAccounts,
    loginCookies: cookieNames,
    authUrlHost: urlOf(process.env.AUTH_URL) ?? urlOf(process.env.NEXTAUTH_URL),
    googleClientConfigured: !!process.env.AUTH_GOOGLE_ID,
    nodeEnv: process.env.NODE_ENV,
  });
}
