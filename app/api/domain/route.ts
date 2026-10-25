import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  VercelApiError,
  checkAvailability,
  getPrices,
  vercelDomainsConfigured,
} from "@/lib/vercel-domains";

// Domains offered for every name that is searched. Any TLD Vercel does not sell is
// dropped automatically (its availability comes back as "unknown").
const TLDS = ["com", "in", "io", "app", "dev", "co", "net", "org", "xyz", "tech"];
const SUGGEST_TLDS = ["com", "in"];
const MAX_DOMAINS_PER_REQUEST = 24;

// Best-effort limit per user (each serverless instance keeps its own counter).
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 15;
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^[a-z]{2,24}(?:\.[a-z]{2,24})?$/;

/** "https://www.MyBrand.com/x" -> { label: "mybrand", exact: "mybrand.com" } */
function parseQuery(raw: string): { label: string; exact?: string } | null {
  let s = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  s = s.split(/[/?#\s]/)[0] || "";
  if (!s) return null;
  const dot = s.indexOf(".");
  const label = dot === -1 ? s : s.slice(0, dot);
  const tld = dot === -1 ? "" : s.slice(dot + 1);
  if (!LABEL.test(label)) return null;
  if (tld && !TLD.test(tld)) return null;
  return { label, exact: tld ? `${label}.${tld}` : undefined };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

    if (!vercelDomainsConfigured()) {
      return NextResponse.json(
        { error: "Domain search is not set up yet.", code: "VERCEL_NOT_CONFIGURED" },
        { status: 501 }
      );
    }
    if (rateLimited(userId)) {
      return NextResponse.json({ error: "Too many searches. Wait a minute and try again." }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = parseQuery(searchParams.get("name") || searchParams.get("domain") || "");
    if (!parsed) {
      return NextResponse.json(
        { error: "Enter a name like mybrand or mybrand.com (letters, numbers and hyphens only)." },
        { status: 400 }
      );
    }
    const suggest = searchParams.get("suggest") === "true";
    const { label, exact } = parsed;

    // What to look up
    let candidates: string[];
    if (suggest) {
      const bases = [`get${label}`, `try${label}`, `${label}app`, `${label}hq`, `${label}online`];
      candidates = bases.flatMap((b) => SUGGEST_TLDS.map((t) => `${b}.${t}`));
    } else {
      candidates = [...(exact ? [exact] : []), ...TLDS.map((t) => `${label}.${t}`)];
    }
    candidates = [...new Set(candidates)].filter((d) => d.split(".")[0].length <= 63).slice(0, MAX_DOMAINS_PER_REQUEST);

    const availability = await checkAvailability(candidates);

    // Only the domains that Vercel understands (true or false) are shown.
    const known = candidates.filter((d) => availability.get(d) !== null && availability.get(d) !== undefined);
    const availableNames = known.filter((d) => availability.get(d) === true);
    const prices = await getPrices(availableNames);

    const markup = Number(process.env.DOMAIN_MARKUP_PERCENT) || 0;
    const usdToInr = Number(process.env.USD_TO_INR) || 0;

    const results = known.map((domain) => {
      const available = availability.get(domain) === true;
      const p = available ? prices.get(domain) : undefined;
      const priceUsd = p?.purchase != null ? round2(p.purchase * (1 + markup / 100)) : null;
      return {
        domain,
        available,
        // Available but no price = Vercel will not sell it (for example a premium name)
        purchasable: available && priceUsd !== null,
        years: p?.years ?? null,
        priceUsd,
        renewalUsd: p?.renewal != null ? round2(p.renewal * (1 + markup / 100)) : null,
        priceInrEstimate: priceUsd !== null && usdToInr > 0 ? Math.round(priceUsd * usdToInr) : null,
      };
    });

    // Searched name first, then available ones, then taken ones (stable inside each group)
    const rank = (r: (typeof results)[number]) => (r.domain === exact ? 0 : r.purchasable ? 1 : 2);
    results.sort((a, b) => rank(a) - rank(b));

    return NextResponse.json({
      query: label,
      suggest,
      results: suggest ? results.filter((r) => r.purchasable) : results,
      unsupportedCount: candidates.length - known.length,
    });
  } catch (error: unknown) {
    console.error("DOMAIN SEARCH ERROR:", error);
    if (error instanceof VercelApiError) {
      const status = error.status === 429 ? 429 : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Could not check domains right now. Please try again." }, { status: 500 });
  }
}
