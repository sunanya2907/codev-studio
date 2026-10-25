// Real domain availability + prices from Vercel's Domains Registrar API.
// Docs: https://vercel.com/docs/domains/registrar-api
//   GET  /v1/registrar/domains/{domain}/availability   -> { available }
//   POST /v1/registrar/domains/availability {domains}  -> { results: [{ domain, available }] }  (max 50)
//   GET  /v1/registrar/domains/{domain}/price          -> { years, purchasePrice, renewalPrice, transferPrice } (USD)
//   POST /v1/registrar/domains/price {domains, years?} -> { results: [...] }                     (max 50)

const API = "https://api.vercel.com";

export const vercelDomainsConfigured = () => !!process.env.VERCEL_TOKEN?.trim();

export class VercelApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function endpoint(path: string): string {
  const u = new URL(API + path);
  const team = process.env.VERCEL_TEAM_ID?.trim();
  if (team) u.searchParams.set("teamId", team);
  return u.toString();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function vercel(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) throw new VercelApiError("VERCEL_TOKEN is not set.", 501);
  const res = await fetch(endpoint(path), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  // A bad or under-privileged token is a configuration problem, not a per-domain problem.
  if (res.status === 401 || res.status === 403) {
    throw new VercelApiError("Vercel rejected the API token (check VERCEL_TOKEN and VERCEL_TEAM_ID).", res.status);
  }
  if (res.status === 429) {
    throw new VercelApiError("Too many domain searches right now. Please wait a moment and try again.", 429);
  }
  return { ok: res.ok, status: res.status, data };
}

/** true / false, or null when Vercel cannot say (for example the TLD is not supported). */
export async function checkAvailability(domains: string[]): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>();
  const bulk = await vercel("/v1/registrar/domains/availability", { domains });
  if (bulk.ok && Array.isArray(bulk.data?.results)) {
    for (const r of bulk.data.results) out.set(String(r.domain).toLowerCase(), !!r.available);
    for (const d of domains) if (!out.has(d)) out.set(d, null);
    return out;
  }
  // One unsupported TLD can make the whole bulk request fail, so ask one by one instead.
  await Promise.all(
    domains.map(async (d) => {
      try {
        const r = await vercel(`/v1/registrar/domains/${encodeURIComponent(d)}/availability`);
        out.set(d, r.ok && typeof r.data?.available === "boolean" ? r.data.available : null);
      } catch (e) {
        if (e instanceof VercelApiError && e.status !== 501) throw e;
        out.set(d, null);
      }
    })
  );
  return out;
}

export type DomainPrice = { years: number; purchase: number | null; renewal: number | null };

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** USD prices straight from Vercel, for the TLD's minimum number of years (usually 1). */
export async function getPrices(domains: string[]): Promise<Map<string, DomainPrice>> {
  const out = new Map<string, DomainPrice>();
  if (domains.length === 0) return out;

  const bulk = await vercel("/v1/registrar/domains/price", { domains });
  if (bulk.ok && Array.isArray(bulk.data?.results)) {
    for (const r of bulk.data.results) {
      out.set(String(r.domain).toLowerCase(), {
        years: num(r.years) ?? 1,
        purchase: num(r.purchasePrice),
        renewal: num(r.renewalPrice),
      });
    }
    return out;
  }
  await Promise.all(
    domains.map(async (d) => {
      try {
        const r = await vercel(`/v1/registrar/domains/${encodeURIComponent(d)}/price`);
        if (r.ok) {
          out.set(d, {
            years: num(r.data?.years) ?? 1,
            purchase: num(r.data?.purchasePrice),
            renewal: num(r.data?.renewalPrice),
          });
        }
      } catch (e) {
        if (e instanceof VercelApiError && e.status !== 501) throw e;
      }
    })
  );
  return out;
}
