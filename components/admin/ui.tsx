"use client";
// Small building blocks shared by every /admin page (no chart library: bars are plain divs).
import { useCallback, useEffect, useState, type ReactNode } from "react";

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Error ${res.status}`);
        setData(null);
      } else {
        setError("");
        setData(json as T);
      }
    } catch {
      setError("Network error. Is the server running?");
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: load };
}

export async function postJson(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json: json as Record<string, any> };
}

export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");

export const when = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

export function ago(iso: string | Date | null | undefined) {
  if (!iso) return "Never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return when(iso);
}

export const place = (country?: string | null, city?: string | null) =>
  [city, country].filter(Boolean).join(", ") || "Unknown";

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "border-slate-700 bg-slate-800/60 text-slate-300",
  good: "border-emerald-700/60 bg-emerald-950/50 text-emerald-300",
  bad: "border-red-800/70 bg-red-950/50 text-red-300",
  warn: "border-amber-700/60 bg-amber-950/40 text-amber-300",
  info: "border-violet-700/60 bg-violet-950/40 text-violet-300",
  cyan: "border-cyan-700/60 bg-cyan-950/40 text-cyan-300",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

export const tierTone = (t: string) => (t === "EXCLUSIVE" ? "info" : t === "PRO" ? "cyan" : t === "STANDARD" ? "good" : "neutral");

export function Panel({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/60 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bad" | "good" | "warn" }) {
  const color = tone === "bad" ? "text-red-300" : tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-white";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function Bars({ data, color = "#8B5CF6", label }: { data: { day: string; n: number }[]; color?: string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div role="img" aria-label={`${label}: ${data.map((d) => `${d.day} ${d.n}`).join(", ")}`}>
      <div className="flex h-28 items-end gap-1">
        {data.map((d) => (
          <div key={d.day} title={`${d.day}: ${d.n}`} className="flex h-full flex-1 flex-col justify-end">
            <div className="w-full rounded-t" style={{ height: `${Math.max(d.n ? 4 : 1, (d.n / max) * 100)}%`, background: d.n ? color : "#1E293B" }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{data[0]?.day.slice(5)}</span>
        <span>total {fmt(data.reduce((a, d) => a + d.n, 0))}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
      <span>{fmt(total)} total</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-40">Previous</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border border-slate-700 px-3 py-1.5 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="mb-4 rounded-lg border border-red-900/70 bg-red-950/40 p-3 text-sm text-red-200">{message}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

/** A table that scrolls sideways on a phone. */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-400">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">{children}</tbody>
      </table>
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-700 bg-[#090D16] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none";
export const btnCls =
  "rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50";
export const btnPrimary =
  "rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50";

export function Skeleton() {
  return <div className="animate-pulse text-sm text-slate-500">Loading...</div>;
}
