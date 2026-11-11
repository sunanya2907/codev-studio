"use client";
import { useCallback, useEffect, useState } from "react";

type Invite = {
  id: string; label: string; tier: string; tokens: number; accessDays: number;
  maxUses: number; uses: number; expiresAt: string; revokedAt: string | null;
};

export default function TesterAdmin() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ label: "", tier: "EXCLUSIVE", tokens: 50, accessDays: 14, maxUses: 10, linkValidDays: 14 });

  const load = useCallback(async () => {
    const res = await fetch("/api/tester/invites", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(data.error || "Could not load invites.");
    setInvites(data.invites);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/tester/invites", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(data.error || "Failed.");
      setMsg("");
      if (data.link) setLink(data.link);
      await load();
    } finally { setBusy(false); }
  }

  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  const input = "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm";

  return (
    <main className="mx-auto w-full max-w-4xl p-6 text-white">
      <h1 className="text-2xl font-semibold">Tester links</h1>
      <p className="mb-6 text-sm text-neutral-400">Give developers and testers temporary free access to a paid plan.</p>
      {msg && <p className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">{msg}</p>}

      <div className="mb-6 grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:grid-cols-3">
        <label className="text-xs sm:col-span-3">Label<input className={input} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. QA team November" /></label>
        <label className="text-xs">Plan
          <select className={input} value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })}>
            <option value="EXCLUSIVE">Exclusive (everything)</option><option value="PRO">Pro</option><option value="STANDARD">Standard</option>
          </select>
        </label>
        <label className="text-xs">Tokens each<input className={input} type="number" min={1} max={500} value={f.tokens} onChange={num("tokens")} /></label>
        <label className="text-xs">Access days<input className={input} type="number" min={1} max={90} value={f.accessDays} onChange={num("accessDays")} /></label>
        <label className="text-xs">Max people<input className={input} type="number" min={1} max={1000} value={f.maxUses} onChange={num("maxUses")} /></label>
        <label className="text-xs">Link valid (days)<input className={input} type="number" min={1} max={90} value={f.linkValidDays} onChange={num("linkValidDays")} /></label>
        <div className="flex items-end"><button disabled={busy} onClick={() => post(f)} className="w-full rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50">Create link</button></div>
      </div>

      {link && (
        <div className="mb-6 rounded-xl border border-emerald-700 bg-emerald-950/40 p-4">
          <p className="mb-2 text-xs text-emerald-300">Copy it now. For security it cannot be shown again.</p>
          <div className="flex gap-2">
            <input readOnly className={input + " font-mono"} value={link} onFocus={(e) => e.target.select()} />
            <button onClick={() => navigator.clipboard.writeText(link)} className="rounded-lg border border-neutral-600 px-3 text-xs">Copy</button>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {invites.map((i) => {
          const dead = !!i.revokedAt || new Date(i.expiresAt) < new Date();
          return (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
              <div>
                <span className="font-medium">{i.label}</span>{" "}
                <span className="text-xs text-neutral-400">{i.tier} · {i.tokens} tokens · {i.accessDays}d · {i.uses}/{i.maxUses} used · link until {new Date(i.expiresAt).toLocaleDateString()}</span>
                {dead && <span className="ml-2 rounded bg-neutral-700 px-2 py-0.5 text-xs">{i.revokedAt ? "revoked" : "expired"}</span>}
              </div>
              {!i.revokedAt && <button disabled={busy} onClick={() => post({ action: "revoke", id: i.id })} className="rounded border border-neutral-600 px-3 py-1 text-xs">Revoke</button>}
            </li>
          );
        })}
        {invites.length === 0 && <p className="text-sm text-neutral-500">No links yet.</p>}
      </ul>
    </main>
  );
}
