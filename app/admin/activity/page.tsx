"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Empty, ErrorBox, PageHeader, Pager, Panel, Skeleton, ago, fmt, inputCls, place, useApi } from "@/components/admin/ui";

type Row = { id: string; userId: string; email: string; kind: string; detail: string | null; tokens: number; ip: string | null; country: string | null; city: string | null; createdAt: string };

const KIND_LABEL: Record<string, string> = {
  BUILD: "Builds", CUSTOMIZE: "Edits", CHAT: "Project chat", QUESTIONS: "Question prompts", ENHANCE: "Enhance prompt",
  DOMAIN_SEARCH: "Domain searches", VOICE: "Voice", TESTER_REDEEM: "Tester links", REQUEST: "Requests",
};

export default function AdminActivity() {
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setTerm(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, error, loading } = useApi<{ total: number; size: number; kinds: { kind: string; n: number }[]; rows: Row[] }>(
    `/api/admin/activity?page=${page}&kind=${kind}&q=${encodeURIComponent(term)}`
  );

  return (
    <main className="mx-auto w-full max-w-6xl">
      <PageHeader title="Activity and searches" sub="What every person typed, searched and used: build ideas, domain searches, voice sessions, edits." />
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => { setKind(""); setPage(1); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${kind === "" ? "border-violet-500 bg-violet-600/20 text-violet-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}>All</button>
        {data?.kinds.map((k) => (
          <button key={k.kind} onClick={() => { setKind(k.kind); setPage(1); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${kind === k.kind ? "border-violet-500 bg-violet-600/20 text-violet-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}>
            {KIND_LABEL[k.kind] ?? k.kind} <span className="text-slate-500">{fmt(k.n)}</span>
          </button>
        ))}
      </div>
      <label className="mb-4 block text-xs text-slate-400">Search the text people typed, an email, IP address or city
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. hospital, mybrand.com, user@gmail.com" />
      </label>
      <ErrorBox message={error} />
      <Panel>
        {loading && !data && <Skeleton />}
        {data && data.rows.length === 0 && <Empty>Nothing found. Activity is recorded from now on.</Empty>}
        {data && data.rows.length > 0 && (
          <ul className="divide-y divide-slate-800/70">
            {data.rows.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge tone="info">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                  <Link href={`/admin/users/${r.userId}`} className="font-medium text-slate-100 hover:underline">{r.email}</Link>
                  {r.tokens > 0 && <Badge tone="warn">{r.tokens} token{r.tokens > 1 ? "s" : ""}</Badge>}
                  <span className="text-xs text-slate-500">{place(r.country, r.city)} · {r.ip} · {ago(r.createdAt)}</span>
                </div>
                {r.detail && <p className="mt-1 line-clamp-4 break-words text-slate-300">{r.detail}</p>}
              </li>
            ))}
          </ul>
        )}
        {data && <Pager page={page} size={data.size} total={data.total} onPage={setPage} />}
      </Panel>
    </main>
  );
}
