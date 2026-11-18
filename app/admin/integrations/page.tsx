"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Bars, Empty, ErrorBox, PageHeader, Panel, Skeleton, Stat, Table, ago, btnCls, fmt, useApi } from "@/components/admin/ui";

type Data = {
  keys: { group: string; note: string; vars: { name: string; label: string; required: boolean; secret: boolean; set: boolean; usedName?: string; display: string | null }[] }[];
  modelChain: string[];
  usage: {
    calls24h: number; tokensIn24h: number; tokensOut24h: number;
    models: { model: string; ok: number; failed: number; avgMs: number; tokensIn: number; tokensOut: number }[];
    purposes: { purpose: string; n: number; tokensIn: number; tokensOut: number }[];
    topUsers: { userId: string; email: string; calls: number; tokensIn: number; tokensOut: number }[];
    failures: { id: string; model: string; purpose: string | null; error: string | null; ms: number; createdAt: string }[];
    series: { calls: { day: string; n: number }[]; failed: { day: string; n: number }[] };
  };
};
type Health = { ok: boolean; error?: string; primaryModel?: string; results?: { model: string; ok: boolean; status: number; ms: number; answer?: string; error?: string }[] };

export default function AdminIntegrations() {
  const { data: d, error, loading, reload } = useApi<Data>("/api/admin/integrations");
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);

  async function runCheck() {
    setChecking(true);
    setHealth(null);
    try {
      const res = await fetch("/api/health/ai", { cache: "no-store" });
      setHealth(await res.json().catch(() => ({ ok: false, error: "Bad answer" })));
    } finally {
      setChecking(false);
    }
  }

  const missingRequired = d?.keys.flatMap((g) => g.vars).filter((v) => v.required && !v.set) ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl">
      <PageHeader title="API keys and AI usage" sub="Which keys are configured, whether the AI works, and what it costs in calls and tokens." right={<button onClick={reload} className={btnCls}>Refresh</button>} />
      <ErrorBox message={error} />
      {loading && !d && <Skeleton />}
      {d && (
        <>
          {missingRequired.length > 0 && (
            <p role="alert" className="mb-4 rounded-lg border border-red-900/70 bg-red-950/40 p-3 text-sm text-red-200">
              Missing required settings: {missingRequired.map((v) => v.name).join(", ")}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {d.keys.map((g) => (
              <Panel key={g.group} title={g.group}>
                {g.note && <p className="mb-3 text-xs text-slate-500">{g.note}</p>}
                <ul className="divide-y divide-slate-800/70">
                  {g.vars.map((v) => (
                    <li key={v.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <div className="text-slate-200">{v.label}</div>
                        <div className="font-mono text-[11px] text-slate-500">{v.usedName ?? v.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {v.display && <span className="max-w-[14rem] truncate font-mono text-xs text-slate-400">{v.display}</span>}
                        {v.set ? <Badge tone="good">set</Badge> : <Badge tone={v.required ? "bad" : "neutral"}>{v.required ? "missing" : "not set"}</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Secrets are never sent to your browser: only whether they are set and their last 4 characters. To change a key, edit it in your hosting settings and redeploy.</p>

          <Panel
            title="Live AI check"
            className="mt-6"
            right={<button disabled={checking} onClick={runCheck} className={btnCls}>{checking ? "Checking..." : "Test every model now"}</button>}
          >
            <p className="mb-3 text-xs text-slate-500">Model order used for builds: {d.modelChain.join(" then ")}. The test sends one tiny request to each (it uses a little of your quota).</p>
            {!health && !checking && <Empty>Press the button to test the key and every model.</Empty>}
            {checking && <Skeleton />}
            {health && (
              <>
                {health.error && <ErrorBox message={health.error} />}
                <ul className="space-y-2 text-sm">
                  {health.results?.map((r) => (
                    <li key={r.model} className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.ok ? "good" : "bad"}>{r.ok ? "works" : `HTTP ${r.status}`}</Badge>
                      <span className="font-mono text-xs">{r.model}</span>
                      <span className="text-xs text-slate-500">{r.ms} ms</span>
                      {r.error && <span className="text-xs text-red-300">{r.error}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="AI calls (24 h)" value={fmt(d.usage.calls24h)} />
            <Stat label="Tokens in (24 h)" value={fmt(d.usage.tokensIn24h)} />
            <Stat label="Tokens out (24 h)" value={fmt(d.usage.tokensOut24h)} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="AI calls per day (14 days)"><Bars data={d.usage.series.calls} label="AI calls per day" /></Panel>
            <Panel title="Failed AI calls per day"><Bars data={d.usage.series.failed} color="#EF4444" label="Failed AI calls per day" /></Panel>
          </div>

          <Panel title="By model (7 days)" className="mt-4">
            {d.usage.models.length === 0 ? <Empty>No AI calls recorded yet.</Empty> : (
              <Table head={["Model", "OK", "Failed", "Avg time", "Tokens in", "Tokens out"]}>
                {d.usage.models.map((m) => (
                  <tr key={m.model}>
                    <td className="px-3 py-2 font-mono text-xs">{m.model}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(m.ok)}</td>
                    <td className="px-3 py-2 tabular-nums">{m.failed ? <span className="text-red-300">{fmt(m.failed)}</span> : 0}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(m.avgMs)} ms</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(m.tokensIn)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(m.tokensOut)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="What the AI is used for (7 days)">
              {d.usage.purposes.length === 0 ? <Empty>No data yet.</Empty> : (
                <Table head={["Purpose", "Calls", "Tokens out"]}>
                  {d.usage.purposes.map((p) => (
                    <tr key={p.purpose}><td className="px-3 py-2">{p.purpose}</td><td className="px-3 py-2 tabular-nums">{fmt(p.n)}</td><td className="px-3 py-2 tabular-nums">{fmt(p.tokensOut)}</td></tr>
                  ))}
                </Table>
              )}
            </Panel>
            <Panel title="Who uses the most AI (7 days)">
              {d.usage.topUsers.length === 0 ? <Empty>No data yet.</Empty> : (
                <Table head={["Person", "Calls", "Tokens out"]}>
                  {d.usage.topUsers.map((u) => (
                    <tr key={u.userId}>
                      <td className="px-3 py-2"><Link href={`/admin/users/${u.userId}`} className="hover:underline">{u.email}</Link></td>
                      <td className="px-3 py-2 tabular-nums">{fmt(u.calls)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(u.tokensOut)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>
          </div>

          <Panel title="Latest failed AI calls" className="mt-4">
            {d.usage.failures.length === 0 ? <Empty>No failures. 429 means quota or rate limit, 404 a model that does not exist, 400/403 a key problem.</Empty> : (
              <ul className="divide-y divide-slate-800/70 text-sm">
                {d.usage.failures.map((f) => (
                  <li key={f.id} className="py-2">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone="bad">{f.purpose ?? "ai"}</Badge><span className="font-mono text-xs">{f.model}</span><span className="text-xs text-slate-500">{f.ms} ms · {ago(f.createdAt)}</span></div>
                    <p className="mt-1 break-words text-xs text-red-300">{f.error}</p>
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
