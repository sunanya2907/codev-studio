import { NextResponse, type NextRequest } from "next/server";

/**
 * Anti-scraping / anti-cloning gate (Next.js 16 "proxy", formerly "middleware").
 *
 * 1. Blocks well-known site-copier and scraper user agents (HTTrack, wget, curl,
 *    python-requests, Scrapy, headless tooling ...).
 * 2. Blocks requests for source maps and dotfiles / VCS folders (.git, .env ...).
 * 3. Rate-limits /api per IP (in-memory, per instance; use Redis/Upstash for a
 *    shared limit across serverless instances).
 *
 * Payment webhooks and auth callbacks are exempt: providers use their own UAs.
 * Honest limit: a determined person can spoof headers. This stops casual
 * copying and bulk scraping, not a motivated attacker.
 */

const BLOCKED_UA =
  /(httrack|wget|curl|libwww|python-requests|python-urllib|aiohttp|scrapy|go-http-client|java\/|okhttp|node-fetch|axios|undici|headlesschrome|phantomjs|puppeteer|playwright|selenium|webzip|webcopier|teleport|offline explorer|sitesucker|site ?sniffer|webreaper|cyotek|httpclient|scrapy|apify)/i;

const EXEMPT_PREFIXES = [
  "/api/stripe/webhook",
  "/api/razorpay/webhook",
  "/api/auth", // NextAuth callbacks (Google OAuth)
  "/api/debug/run", // protected by its own secret (CI agent)
];

const FORBIDDEN_PATH = /(\.map$|\/\.(git|env|svn|hg|devin|cursor|claude|agents|github)(\/|$)|\.env)/i;

// --- tiny fixed-window rate limiter ---------------------------------------
const WINDOW_MS = 60_000;
const MAX_REQ = 120; // per IP per minute across /api
const hits = new Map<string, { n: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || rec.reset < now) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    }
    return false;
  }
  rec.n += 1;
  return rec.n > MAX_REQ;
}

const deny = (status: number, msg: string) =>
  new NextResponse(msg, { status, headers: { "Cache-Control": "no-store" } });

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (FORBIDDEN_PATH.test(pathname)) return deny(404, "Not found");

  const ua = req.headers.get("user-agent") || "";
  // Empty UA or a known scraping tool: not a real browser.
  if (!ua || BLOCKED_UA.test(ua)) return deny(403, "Forbidden");

  // Fake-UA defence for API routes only: real browsers always send Sec-Fetch-*
  // headers on fetch() calls from our own pages, while curl/scripts that merely
  // spoof a UA string do not. Pages are NOT checked, so older browsers, proxies
  // and search/social crawlers can still load the site.
  if (pathname.startsWith("/api/")) {
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin") return deny(403, "Forbidden");
    if (!fetchSite && !req.headers.get("accept-language")) return deny(403, "Forbidden");
  }

  if (pathname.startsWith("/api/")) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (limited(ip)) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static assets (fonts/images/chunks).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
