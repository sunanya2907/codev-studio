import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Removes EVERY login cookie of this site (all Auth.js / next-auth names, including the
 * "__Secure-" ones and the split ".0 / .1" pieces of a big session cookie). The landing page calls
 * this before a new sign-in, so no leftover login of another account can survive.
 */
export async function POST() {
  const jar = await cookies();
  const removed: string[] = [];
  for (const c of jar.getAll()) {
    if (/authjs|next-auth/i.test(c.name)) {
      jar.delete(c.name);
      removed.push(c.name);
    }
  }
  return NextResponse.json({ ok: true, removed });
}
