"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Badge, Empty, ErrorBox, PageHeader, Panel, Skeleton, Stat, Table, ago, btnCls, btnPrimary, fmt, inputCls, place, postJson, tierTone, useApi, when,
} from "@/components/admin/ui";

type Detail = {
  user: {
    id: string; email: string; name: string | null; tier: string; tokenBalance: number; voiceSeconds: number; planExpiresAt: string | null;
    createdAt: string; lastLoginAt: string | null; lastLogoutAt: string | null; lastIp: string | null; lastCountry: string | null; lastCity: string | null;
    loginCount: number; blockedAt: string | null; blockedReason: string | null; verified: boolean; hasPassword: boolean; hasStripe: boolean;
    termsAccepted: boolean; termsAcceptedAt: string | null;
  };
  providers: string[];
  stats: { builds: number; done: number; failed: number; tokensSpentOnBuilds: number; voiceSessions: number; voiceSeconds: number };
  ips: { ip: string; country: string | null; city: string | null; device: string | null; count: number; lastSeen: string }[];
  logins: { id: string; type: string; method: string | null; ip: string | null; country: string | null; city: string | null; device: string | null; createdAt: string }[];
  activity: { id: string; kind: string; detail: string | null; tokens: number; country: string | null; city: string | null; createdAt: string }[];
  builds: { id: string; prompt: string; status: string; cost: number; error: string | null; createdAt: string }[];
  redemptions: { redeemedAt: string; invite: { label: string; tier: string; tokens: number; accessDays: number } }[];
  requests: { id: string; type: string; message: string; status: string; createdAt: string }[];
  actions: { id: string; adminEmail: string; action: string; detail: string | null; createdAt: string }[];
  payments: { id: string; kind: string; createdAt: string }[];
};

const loginTone = (t: string) => (t === "LOGIN" ? "good" : t === "LOGOUT" ? "neutral" : "bad");
const statusTone = (s: string) => (s === "DONE" ? "good" : s === "FAILED" ? "bad" : "warn");

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error, loading, reload } = useApi<Detail>(`/api/admin/user?id=${encodeURIComponent(id)}`);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(10);
  const [tokenReason, setTokenReason] = useState("");
  const [tier, setTier] = useState("STANDARD");
  const [days, setDays] = useState(30);
  const [blockReason, setBlockReason] = useState("");

  async function act(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg("");
    const r = await postJson("/api/admin/user", { id, ...body });
    setBusy(false);
    if (!r.ok) return setMsg(r.json.error || "Failed.");
    setMsg(okText);
    reload();
  }

  if (loading && !d) return <main className="mx-auto w-full max-w-6xl"><Skeleton /></main>;
  if (!d) return <main className="mx-auto w-full max-w-6xl"><ErrorBox message={error || "Not found."} /><Link href="/admin/users" className="text-sm text-violet-300 hover:underline">Back to users</Link></main>;
  const u = d.user;

  return (
    <main className="mx-auto w-full max-w-6xl">
      <Link href="/admin/users" className="mb-3 inline-block text-xs text-violet-300 hover:underline">All users</Link>
      <PageHeader
        title={u.email}
        sub={`${u.name || "No name"} · joined ${when(u.createdAt)}`}
        right={
          <div className="flex flex-wrap gap-2">
            <Badge tone={tierTone(u.tier)}>{u.tier}</Badge>
            {u.blockedAt && <Badge tone="bad">blocked</Badge>}
            <Badge tone={u.verified ? "good" : "warn"}>{u.verified ? "email verified" : "not verified"}</Badge>
            {d.providers.map((p) => <Badge key={p}>{p}</Badge>)}
            {u.hasPassword && <Badge>password</Badge>}
          </div>
        }
      />
      <ErrorBox message={error} />
      {msg && <p role="status" className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm">{msg}</p>}
      {u.blockedAt && (
        <p className="mb-4 rounded-lg border border-red-900/70 bg-red-950/40 p-3 text-sm text-red-200">
          Blocked {when(u.blockedAt)}{u.blockedReason ? `: ${u.blockedReason}` : ""}. This person cannot sign in and any open session stops working.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tokens" value={fmt(u.tokenBalance)} sub={u.planExpiresAt ? `plan until ${when(u.planExpiresAt)}` : "no plan expiry"} />
        <Stat label="Builds" value={fmt(d.stats.builds)} sub={`${fmt(d.stats.done)} done, ${fmt(d.stats.failed)} failed`} />
        <Stat label="Tokens spent on builds" value={fmt(d.stats.tokensSpentOnBuilds)} sub={`voice: ${d.stats.voiceSessions} sessions, ${Math.round(d.stats.voiceSeconds / 60)} min`} />
        <Stat label="Logins" value={fmt(u.loginCount)} sub={`last ${ago(u.lastLoginAt)}`} />
        <Stat label="Last login" value={<span className="text-base">{when(u.lastLoginAt)}</span>} sub={`${place(u.lastCountry, u.lastCity)} · ${u.lastIp ?? "no IP"}`} />
        <Stat label="Last logout" value={<span className="text-base">{when(u.lastLogoutAt)}</span>} sub="only recorded when they click Sign out" />
        <Stat label="Terms accepted" value={u.termsAccepted ? "Yes" : "No"} sub={u.termsAcceptedAt ? when(u.termsAcceptedAt) : undefined} />
        <Stat label="Payments recorded" value={fmt(d.payments.length)} sub={u.hasStripe ? "Stripe customer" : "no Stripe subscription"} />
      </div>

      <Panel title="Manage this person" className="mt-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Add or remove tokens</h3>
            <label className="block text-xs text-slate-400">Amount (negative removes)
              <input type="number" className={inputCls} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <label className="block text-xs text-slate-400">Reason (saved in the audit log)
              <input className={inputCls} value={tokenReason} onChange={(e) => setTokenReason(e.target.value)} />
            </label>
            <button disabled={busy || !amount} className={btnPrimary} onClick={() => act({ action: "grant_tokens", amount, reason: tokenReason }, "Tokens updated.")}>Apply</button>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Change plan</h3>
            <label className="block text-xs text-slate-400">Plan
              <select className={inputCls} value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="FREE">Free (removes the paid plan)</option><option value="STANDARD">Standard</option><option value="PRO">Pro</option><option value="EXCLUSIVE">Exclusive</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">Days
              <input type="number" min={1} max={365} className={inputCls} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </label>
            <button disabled={busy} className={btnPrimary} onClick={() => confirm(`Set ${u.email} to ${tier}?`) && act({ action: "set_tier", tier, days }, "Plan updated.")}>Set plan</button>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{u.blockedAt ? "Unblock" : "Block this person"}</h3>
            {!u.blockedAt && (
              <label className="block text-xs text-slate-400">Reason
                <input className={inputCls} value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="e.g. abuse, chargeback" />
              </label>
            )}
            <button
              disabled={busy}
              className={u.blockedAt ? btnPrimary : "rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"}
              onClick={() => u.blockedAt ? act({ action: "unblock" }, "Unblocked.") : confirm(`Block ${u.email}? They are signed out immediately.`) && act({ action: "block", reason: blockReason }, "Blocked.")}
            >
              {u.blockedAt ? "Unblock" : "Block"}
            </button>
          </div>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Where they signed in from">
          {d.ips.length === 0 ? <Empty>No logins recorded yet.</Empty> : (
            <Table head={["IP address", "Place", "Device", "Times", "Last"]}>
              {d.ips.map((i) => (
                <tr key={i.ip}>
                  <td className="px-3 py-2 font-mono text-xs">{i.ip}</td>
                  <td className="px-3 py-2">{place(i.country, i.city)}</td>
                  <td className="px-3 py-2 text-slate-400">{i.device ?? "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{i.count}</td>
                  <td className="px-3 py-2 text-slate-400">{ago(i.lastSeen)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        <Panel title="Login and logout history">
          {d.logins.length === 0 ? <Empty>No history yet.</Empty> : (
            <ul className="max-h-96 divide-y divide-slate-800/70 overflow-y-auto">
              {d.logins.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <Badge tone={loginTone(l.type)}>{l.type === "LOGIN_FAILED" ? "FAILED" : l.type}</Badge>
                  <span className="text-slate-200">{when(l.createdAt)}</span>
                  <span className="text-slate-400">{place(l.country, l.city)}</span>
                  <span className="font-mono text-xs text-slate-500">{l.ip}</span>
                  <span className="text-xs text-slate-500">{[l.device, l.method].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="What they searched, typed and used" className="mt-4">
        {d.activity.length === 0 ? <Empty>No activity recorded yet.</Empty> : (
          <ul className="max-h-[28rem] divide-y divide-slate-800/70 overflow-y-auto">
            {d.activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-sm">
                <Badge tone="info">{a.kind}</Badge>
                <span className="min-w-0 flex-1 break-words text-slate-200">{a.detail}</span>
                {a.tokens > 0 && <Badge tone="warn">{a.tokens} token{a.tokens > 1 ? "s" : ""}</Badge>}
                <span className="text-xs text-slate-500">{place(a.country, a.city)} · {ago(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent builds" className="mt-4">
        {d.builds.length === 0 ? <Empty>No builds yet.</Empty> : (
          <ul className="divide-y divide-slate-800/70">
            {d.builds.map((b) => (
              <li key={b.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  <Badge>{b.cost} token{b.cost > 1 ? "s" : ""}</Badge>
                  <span className="text-xs text-slate-500">{when(b.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-3 break-words text-slate-300">{b.prompt}</p>
                {b.error && <p className="mt-1 text-xs text-red-300">{b.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Tester links used">
          {d.redemptions.length === 0 ? <Empty>None.</Empty> : (
            <ul className="space-y-2 text-sm">
              {d.redemptions.map((r, i) => (
                <li key={i}>{r.invite.label}<div className="text-xs text-slate-500">{r.invite.tier} · {r.invite.tokens} tokens · {r.invite.accessDays} days · {ago(r.redeemedAt)}</div></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Requests">
          {d.requests.length === 0 ? <Empty>None.</Empty> : (
            <ul className="space-y-2 text-sm">
              {d.requests.map((r) => (
                <li key={r.id}><Badge tone={r.status === "ACCEPTED" ? "good" : r.status === "REJECTED" ? "bad" : "warn"}>{r.status}</Badge> {r.type}<div className="line-clamp-2 text-xs text-slate-500">{r.message}</div></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Admin changes (audit log)">
          {d.actions.length === 0 ? <Empty>None.</Empty> : (
            <ul className="space-y-2 text-sm">
              {d.actions.map((a) => (
                <li key={a.id}>{a.action}<div className="text-xs text-slate-500">{a.detail} · {a.adminEmail} · {ago(a.createdAt)}</div></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {d.payments.length > 0 && (
        <Panel title="Payments" className="mt-4">
          <ul className="space-y-1 text-sm text-slate-300">
            {d.payments.map((p) => <li key={p.id}><span className="font-mono text-xs">{p.id}</span> · {p.kind} · {when(p.createdAt)}</li>)}
          </ul>
        </Panel>
      )}
      <button onClick={reload} className={`${btnCls} mt-6`}>Refresh</button>
    </main>
  );
}
