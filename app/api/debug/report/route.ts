import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { reportError } from "@/lib/debug-agent";

// Receives browser errors from lib/debug-client.ts. Open to anonymous visitors (errors can
// happen before login) so it is size-limited and rate-limited.
export const maxDuration = 10;

const hits = new Map<string, { n: number; reset: number }>();
let globalHits = { n: 0, reset: 0 };

function limited(ip: string): boolean {
  const now = Date.now();
  if (now > globalHits.reset) globalHits = { n: 0, reset: now + 60_000 };
  if (++globalHits.n > 200) return true;
  const h = hits.get(ip);
  if (!h || now > h.reset) {
    if (hits.size > 2000) hits.clear();
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  return ++h.n > 20;
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (limited(ip)) return NextResponse.json({ ok: false }, { status: 429 });

    const raw = await req.text();
    if (raw.length > 20_000) return NextResponse.json({ ok: false }, { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

    const message = str(body.message, 1000);
    if (!message) return NextResponse.json({ ok: false }, { status: 400 });

    const err = new Error(message);
    err.stack = str(body.stack, 6000);
    const session = await auth().catch(() => null);
    await reportError(err, { source: "client", route: str(body.route, 200), userId: session?.user?.id });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
