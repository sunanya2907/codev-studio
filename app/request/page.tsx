"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Mine = { id: string; type: string; message: string; status: string; adminNote: string | null; createdAt: string };
const TYPES = [
  ["TESTER", "Tester access (try the paid features for free)"],
  ["TOKENS", "More tokens"],
  ["UPGRADE", "An upgrade"],
  ["OTHER", "Something else"],
];

export default function RequestPage() {
  const [type, setType] = useState("TESTER");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [signedIn, setSignedIn] = useState(true);
  const [mine, setMine] = useState<Mine[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/requests", { cache: "no-store" });
    if (res.status === 401) return setSignedIn(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) setMine(j.requests);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function send() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, message }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(j.error || "Could not send your request.");
      setMsg("Sent. You will see the answer below once it has been reviewed.");
      setMessage("");
      load();
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-700 bg-[#090D16] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none";
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 text-white">
      <Link href="/orchestrate" className="text-xs text-violet-300 hover:underline">Back to the app</Link>
      <h1 className="mt-3 text-2xl font-bold">Request access</h1>
      <p className="mb-6 mt-1 text-sm text-slate-400">Tell us what you need. An admin reviews every request.</p>

      {!signedIn ? (
        <p className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm">Please <Link href="/" className="text-violet-300 underline">sign in</Link> first.</p>
      ) : (
        <>
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <label className="block text-xs text-slate-400">What do you need?
              <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-400">Why? (5 to 500 characters)
              <textarea className={field} rows={4} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. I am testing Build_Core for my team and need the code editor." />
            </label>
            {msg && <p role="status" className="text-sm text-slate-300">{msg}</p>}
            <button disabled={busy || message.trim().length < 5} onClick={send} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50">Send request</button>
          </div>

          {mine.length > 0 && (
            <>
              <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-300">Your requests</h2>
              <ul className="space-y-2">
                {mine.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${r.status === "ACCEPTED" ? "bg-emerald-950 text-emerald-300" : r.status === "REJECTED" ? "bg-red-950 text-red-300" : "bg-amber-950 text-amber-300"}`}>
                      {r.status === "PENDING" ? "WAITING" : r.status}
                    </span>{" "}
                    <span className="text-slate-300">{TYPES.find(([k]) => k === r.type)?.[1]}</span>
                    <p className="mt-1 text-slate-400">{r.message}</p>
                    {r.adminNote && <p className="mt-1 text-xs text-slate-500">Reply: {r.adminNote}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
