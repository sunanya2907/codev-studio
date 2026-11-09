"use client";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  source: string;
  message: string;
  stack: string | null;
  route: string | null;
  method: string | null;
  count: number;
  status: string;
  severity: string | null;
  diagnosis: string | null;
  lastSeenAt: string;
};

const SEV: Record<string, string> = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  medium: "bg-yellow-500 text-black",
  low: "bg-neutral-600",
};
const FILTERS = ["ALL", "NEW", "ANALYZING", "DIAGNOSED", "FAILED", "RESOLVED"];

export default function DebugDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("ALL");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/debug/errors", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(data.error || "Could not load errors.");
      setRows(data.errors);
      setCounts(data.counts);
      setMsg("");
    } catch {
      setMsg("Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function act(body: Record<string, string>) {
    setBusy(true);
    try {
      const res = await fetch("/api/debug/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (body.action === "run") {
        setMsg(
          res.ok
            ? data.skipped
              ? `Agent skipped: ${data.skipped}`
              : `Agent finished: ${data.analyzed} analyzed, ${data.failed} failed, ${data.pending} still waiting.`
            : data.error || "Run failed."
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const shown = rows.filter((r) => filter === "ALL" || r.status === filter);

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Debug Agent</h1>
          <p className="text-sm text-neutral-400">Errors caught in the background, with a diagnosis and suggested fix.</p>
        </div>
        <button
          disabled={busy}
          onClick={() => act({ action: "run" })}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {busy ? "Working..." : "Run agent now"}
        </button>
      </div>

      {msg && <p className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">{msg}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs ${filter === f ? "border-white bg-white text-black" : "border-neutral-700 text-neutral-300"}`}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()} {f !== "ALL" && counts[f] ? `(${counts[f]})` : ""}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="text-sm text-neutral-500">No errors here. That is a good sign.</p>}

      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            <button className="w-full text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {r.severity && <span className={`rounded px-2 py-0.5 font-medium ${SEV[r.severity] ?? "bg-neutral-600"}`}>{r.severity}</span>}
                <span className="rounded border border-neutral-700 px-2 py-0.5">{r.status.toLowerCase()}</span>
                <span className="text-neutral-400">{r.source}{r.route ? ` · ${r.method ?? ""} ${r.route}` : ""}</span>
                <span className="text-neutral-500">×{r.count} · {new Date(r.lastSeenAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 break-words font-mono text-sm">{r.message}</p>
            </button>

            {open === r.id && (
              <div className="mt-4 space-y-4 border-t border-neutral-800 pt-4">
                {r.diagnosis ? (
                  <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">{r.diagnosis}</pre>
                ) : (
                  <p className="text-sm text-neutral-400">Waiting for the agent to analyze this error.</p>
                )}
                {r.stack && (
                  <details>
                    <summary className="cursor-pointer text-xs text-neutral-400">Stack trace</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-3 text-xs">{r.stack}</pre>
                  </details>
                )}
                <div className="flex gap-2">
                  {r.status !== "RESOLVED" && (
                    <button onClick={() => act({ action: "resolve", id: r.id })} className="rounded border border-neutral-600 px-3 py-1 text-xs">
                      Mark resolved
                    </button>
                  )}
                  <button onClick={() => act({ action: "reanalyze", id: r.id })} className="rounded border border-neutral-600 px-3 py-1 text-xs">
                    Re-analyze
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
