"use client";
import Link from "next/link";
import { Badge, Bars, Empty, ErrorBox, PageHeader, Panel, Skeleton, Stat, ago, btnCls, fmt, place, tierTone, useApi } from "@/components/admin/ui";

type Overview = {
  users: { total: number; new24h: number; new7d: number; new30d: number; blocked: number; active24h: number; tiers: Record<string, number> };
  tokens: { inCirculation: number; spent7d: number };
  builds: { total: number; last7d: number; done: number; failed: number; running: number };
  logins: { last24h: number; failed24h: number };
  ai: { calls24h: number; failed24h: number; avgMs: number; tokensIn24h: number; tokensOut24h: number };
  requests: { pending: number };
  errors: { open: number };
  testers: { activeLinks: number; redemptions: number };
  payments30d: number;
  series: { signups: { day: string; n: number }[]; builds: { day: string; n: number }[]; logins: { day: string; n: number }[] };
  countries: { country: string; n: number }[];
  recent: { id: string; kind: string; detail: string | null; tokens: number; country: string | null; city: string | null; createdAt: string; user: string; userId: string }[];
};

export default function AdminOverview() {
  const { data: d, error, loading, reload } = useApi<Overview>("/api/admin/overview");
  const maxCountry = Math.max(1, ...(d?.countries.map((c) => c.n) ?? [1]));
  const failRate = d && d.ai.calls24h ? Math.round((d.ai.failed24h / d.ai.calls24h) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-6xl">
      <PageHeader title="Overview" sub="Everything happening in Build_Core right now." right={<button onClick={reload} className={btnCls}>Refresh</button>} />
      <ErrorBox message={error} />
      {loading && !d && <Skeleton />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Users" value={fmt(d.users.total)} sub={`+${fmt(d.users.new24h)} today, +${fmt(d.users.new7d)} this week`} />
            <Stat label="Active in 24 h" value={fmt(d.users.active24h)} sub={`${fmt(d.logins.last24h)} logins`} />
            <Stat label="Builds" value={fmt(d.builds.total)} sub={`${fmt(d.builds.last7d)} in 7 days, ${fmt(d.builds.running)} running`} />
            <Stat label="Failed builds" value={fmt(d.builds.failed)} tone={d.builds.failed ? "warn" : undefined} sub="tokens are returned" />
            <Stat label="Tokens in circulation" value={fmt(d.tokens.inCirculation)} sub={`${fmt(d.tokens.spent7d)} spent in 7 days`} />
            <Stat label="AI calls (24 h)" value={fmt(d.ai.calls24h)} tone={failRate > 20 ? "bad" : undefined} sub={`${failRate}% failed, avg ${fmt(d.ai.avgMs)} ms`} />
            <Stat label="Failed logins (24 h)" value={fmt(d.logins.failed24h)} tone={d.logins.failed24h > 10 ? "bad" : undefined} sub={`${fmt(d.users.blocked)} blocked users`} />
            <Stat label="Payments (30 d)" value={fmt(d.payments30d)} sub="Razorpay payments recorded" />
          </div>

          {(d.requests.pending > 0 || d.errors.open > 0) && (
            <div className="mt-4 flex flex-wrap gap-3">
              {d.requests.pending > 0 && (
                <Link href="/admin/requests" className="flex items-center gap-2 rounded-xl border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200 hover:bg-amber-950/50">
                  <Badge tone="warn">{d.requests.pending}</Badge> requests are waiting for your answer
                </Link>
              )}
              {d.errors.open > 0 && (
                <Link href="/admin/debug" className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-200 hover:bg-red-950/50">
                  <Badge tone="bad">{d.errors.open}</Badge> open errors in the debug agent
                </Link>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Panel title="New users (14 days)"><Bars data={d.series.signups} label="New users per day" /></Panel>
            <Panel title="Builds (14 days)"><Bars data={d.series.builds} color="#22D3EE" label="Builds per day" /></Panel>
            <Panel title="Logins (14 days)"><Bars data={d.series.logins} color="#818CF8" label="Logins per day" /></Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel title="Plans">
              <ul className="space-y-2 text-sm">
                {["FREE", "STANDARD", "PRO", "EXCLUSIVE"].map((t) => (
                  <li key={t} className="flex items-center justify-between">
                    <Badge tone={tierTone(t)}>{t}</Badge>
                    <span className="tabular-nums text-slate-200">{fmt(d.users.tiers[t] ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                {fmt(d.testers.activeLinks)} tester links active, {fmt(d.testers.redemptions)} redeemed.{" "}
                <Link href="/admin/testers" className="text-violet-300 hover:underline">Manage</Link>
              </p>
            </Panel>
            <Panel title="Where logins come from (30 days)">
              {d.countries.length === 0 ? (
                <Empty>No location data yet. It appears once the site runs on Vercel or Cloudflare.</Empty>
              ) : (
                <ul className="space-y-2 text-sm">
                  {d.countries.map((c) => (
                    <li key={c.country}>
                      <div className="flex justify-between"><span>{c.country}</span><span className="tabular-nums text-slate-300">{fmt(c.n)}</span></div>
                      <div className="mt-1 h-1.5 rounded bg-slate-800"><div className="h-1.5 rounded bg-violet-500" style={{ width: `${(c.n / maxCountry) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="AI usage (24 h)" right={<Link href="/admin/integrations" className="text-xs text-violet-300 hover:underline">Details</Link>}>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-400">Calls</dt><dd className="tabular-nums">{fmt(d.ai.calls24h)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Failed</dt><dd className="tabular-nums">{fmt(d.ai.failed24h)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Tokens in</dt><dd className="tabular-nums">{fmt(d.ai.tokensIn24h)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Tokens out</dt><dd className="tabular-nums">{fmt(d.ai.tokensOut24h)}</dd></div>
              </dl>
            </Panel>
          </div>

          <Panel title="Latest activity" className="mt-4" right={<Link href="/admin/activity" className="text-xs text-violet-300 hover:underline">See all</Link>}>
            {d.recent.length === 0 ? (
              <Empty>Nothing yet. Activity shows up here as people use the app.</Empty>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {d.recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Badge tone="info">{r.kind}</Badge>
                    <Link href={`/admin/users/${r.userId}`} className="font-medium text-slate-100 hover:underline">{r.user}</Link>
                    <span className="min-w-0 flex-1 truncate text-slate-400">{r.detail}</span>
                    <span className="text-xs text-slate-500">{place(r.country, r.city)} · {ago(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}
