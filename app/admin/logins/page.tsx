"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Empty, ErrorBox, PageHeader, Pager, Panel, Skeleton, Stat, Table, fmt, inputCls, place, useApi, when } from "@/components/admin/ui";

type Row = {
  id: string; userId: string | null; email: string | null; type: string; method: string | null; ip: string | null;
  country: string | null; region: string | null; city: string | null; device: string | null; createdAt: string;
};

const tone = (t: string) => (t === "LOGIN" ? "good" : t === "LOGOUT" ? "neutral" : "bad");

export default function AdminLogins() {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setTerm(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, error, loading } = useApi<{ total: number; size: number; last24h: Record<string, number>; rows: Row[] }>(
    `/api/admin/logins?page=${page}&type=${type}&q=${encodeURIComponent(term)}`
  );

  return (
    <main className="mx-auto w-full max-w-6xl">
      <PageHeader title="Logins and locations" sub="Every login, logout and failed login with IP address, country, city and device." />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Logins (24 h)" value={fmt(data?.last24h.LOGIN)} />
        <Stat label="Logouts (24 h)" value={fmt(data?.last24h.LOGOUT)} />
        <Stat label="Failed (24 h)" value={fmt(data?.last24h.LOGIN_FAILED)} tone={(data?.last24h.LOGIN_FAILED ?? 0) > 10 ? "bad" : undefined} />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-400 sm:col-span-2">Search
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="email, IP, city, country or device" />
        </label>
        <label className="text-xs text-slate-400">Type
          <select className={inputCls} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All</option><option value="LOGIN">Logins</option><option value="LOGOUT">Logouts</option><option value="LOGIN_FAILED">Failed logins</option>
          </select>
        </label>
      </div>
      <ErrorBox message={error} />
      <Panel>
        {loading && !data && <Skeleton />}
        {data && data.rows.length === 0 && <Empty>No events yet. They are recorded from now on.</Empty>}
        {data && data.rows.length > 0 && (
          <Table head={["Event", "When", "Person", "Place", "IP address", "Device", "Method"]}>
            {data.rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/40">
                <td className="px-3 py-2"><Badge tone={tone(r.type)}>{r.type === "LOGIN_FAILED" ? "FAILED" : r.type}</Badge></td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-300">{when(r.createdAt)}</td>
                <td className="px-3 py-2">{r.userId ? <Link href={`/admin/users/${r.userId}`} className="hover:underline">{r.email}</Link> : (r.email ?? "unknown")}</td>
                <td className="px-3 py-2">{place(r.country, r.city)}{r.region ? <span className="text-xs text-slate-500"> ({r.region})</span> : null}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.ip}</td>
                <td className="px-3 py-2 text-slate-400">{r.device ?? "-"}</td>
                <td className="px-3 py-2 text-slate-400">{r.method ?? "-"}</td>
              </tr>
            ))}
          </Table>
        )}
        {data && <Pager page={page} size={data.size} total={data.total} onPage={setPage} />}
      </Panel>
      <p className="mt-4 text-xs text-slate-500">
        Location comes from the hosting provider (Vercel, Cloudflare or CloudFront). On localhost it shows Unknown. A logout is only recorded when the person clicks Sign out; closing the tab is not a logout.
      </p>
    </main>
  );
}
