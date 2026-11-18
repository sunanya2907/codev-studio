"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Empty, ErrorBox, PageHeader, Skeleton, ago, btnCls, btnPrimary, fmt, inputCls, place, postJson, tierTone, useApi, when } from "@/components/admin/ui";

type Req = {
  id: string; userId: string; email: string; type: string; message: string; status: string; adminNote: string | null;
  grantTier: string | null; grantTokens: number; grantDays: number; decidedBy: string | null; decidedAt: string | null; createdAt: string;
  user: { tier: string; tokenBalance: number; lastCountry: string | null; lastCity: string | null; lastLoginAt: string | null; createdAt: string } | null;
};

// What "Accept" gives by default for each kind of request. The admin can change it before accepting.
const DEFAULTS: Record<string, { tier: string; tokens: number; days: number }> = {
  TESTER: { tier: "EXCLUSIVE", tokens: 50, days: 14 },
  TOKENS: { tier: "", tokens: 10, days: 14 },
  UPGRADE: { tier: "STANDARD", tokens: 0, days: 30 },
  OTHER: { tier: "", tokens: 0, days: 14 },
};
const TYPE_LABEL: Record<string, string> = { TESTER: "Tester access", TOKENS: "More tokens", UPGRADE: "Upgrade", OTHER: "Other" };

function Card({ r, onDone }: { r: Req; onDone: () => void }) {
  const d = DEFAULTS[r.type] ?? DEFAULTS.OTHER;
  const [tier, setTier] = useState(d.tier);
  const [tokens, setTokens] = useState(d.tokens);
  const [days, setDays] = useState(d.days);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function decide(decision: "accept" | "reject") {
    setBusy(true);
    setErr("");
    const res = await postJson("/api/admin/requests", { id: r.id, decision, tier, tokens, days, note });
    setBusy(false);
    if (!res.ok) return setErr(res.json.error || "Failed.");
    onDone();
  }

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{TYPE_LABEL[r.type] ?? r.type}</Badge>
        <Link href={`/admin/users/${r.userId}`} className="font-medium hover:underline">{r.email}</Link>
        {r.user && <Badge tone={tierTone(r.user.tier)}>{r.user.tier}</Badge>}
        <span className="text-xs text-slate-500">{when(r.createdAt)}</span>
        {r.status !== "PENDING" && <Badge tone={r.status === "ACCEPTED" ? "good" : "bad"}>{r.status}</Badge>}
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{r.message}</p>
      {r.user && (
        <p className="mt-1 text-xs text-slate-500">
          {fmt(r.user.tokenBalance)} tokens now · last seen {ago(r.user.lastLoginAt)} from {place(r.user.lastCountry, r.user.lastCity)} · joined {ago(r.user.createdAt)}
        </p>
      )}

      {r.status === "PENDING" ? (
        <div className="mt-4 border-t border-slate-800 pt-4">
          <ErrorBox message={err} />
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-slate-400">Give plan
              <select className={inputCls} value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="">No plan change</option><option value="STANDARD">Standard</option><option value="PRO">Pro</option><option value="EXCLUSIVE">Exclusive</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">For days
              <input type="number" min={1} max={365} className={inputCls} value={days} disabled={!tier} onChange={(e) => setDays(Number(e.target.value))} />
            </label>
            <label className="text-xs text-slate-400">Give tokens
              <input type="number" min={0} max={500} className={inputCls} value={tokens} onChange={(e) => setTokens(Number(e.target.value))} />
            </label>
            <label className="text-xs text-slate-400">Note to save
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button disabled={busy} onClick={() => decide("accept")} className={btnPrimary}>Accept and grant</button>
            <button disabled={busy} onClick={() => decide("reject")} className={btnCls}>Reject</button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          {r.status === "ACCEPTED" ? `Granted ${r.grantTier ?? "no plan"}${r.grantTier ? ` for ${r.grantDays} days` : ""} and ${r.grantTokens} tokens` : "Rejected"} by {r.decidedBy} · {ago(r.decidedAt)}
          {r.adminNote ? ` · note: ${r.adminNote}` : ""}
        </p>
      )}
    </li>
  );
}

export default function AdminRequests() {
  const [status, setStatus] = useState("PENDING");
  const { data, error, loading, reload } = useApi<{ counts: Record<string, number>; requests: Req[] }>(`/api/admin/requests?status=${status}`);
  const tabs = [["PENDING", "Waiting"], ["ACCEPTED", "Accepted"], ["REJECTED", "Rejected"], ["ALL", "All"]];

  return (
    <main className="mx-auto w-full max-w-4xl">
      <PageHeader title="Requests" sub="People ask for tester access, more tokens or an upgrade from the Request page. Accept to grant it, or reject." />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${status === k ? "border-violet-500 bg-violet-600/20 text-violet-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}>
            {label} {k !== "ALL" && <span className="text-slate-500">{data?.counts[k] ?? 0}</span>}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {loading && !data && <Skeleton />}
      {data && data.requests.length === 0 && <Empty>{status === "PENDING" ? "No requests are waiting. Share the link /request with your users." : "Nothing here."}</Empty>}
      <ul className="space-y-3">{data?.requests.map((r) => <Card key={r.id} r={r} onDone={reload} />)}</ul>
    </main>
  );
}
