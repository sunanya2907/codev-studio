"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, ErrorBox, Empty, PageHeader, Pager, Panel, Skeleton, Table, ago, fmt, inputCls, place, tierTone, useApi } from "@/components/admin/ui";

type Row = {
  id: string; email: string; name: string | null; tier: string; tokenBalance: number; planExpiresAt: string | null;
  createdAt: string; lastLoginAt: string | null; lastLogoutAt: string | null; lastIp: string | null; lastCountry: string | null;
  lastCity: string | null; loginCount: number; blockedAt: string | null; verified: boolean; builds: number;
};

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  // wait until typing stops before searching
  useEffect(() => {
    const t = setTimeout(() => { setTerm(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const url = `/api/admin/users?page=${page}&sort=${sort}&tier=${tier}&status=${status}&q=${encodeURIComponent(term)}`;
  const { data, error, loading } = useApi<{ total: number; size: number; verificationOn: boolean; users: Row[] }>(url);

  return (
    <main className="mx-auto w-full max-w-6xl">
      <PageHeader title="Users" sub="Search everyone who signed up, see where they log in from and open a person to manage them." />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <label className="text-xs text-slate-400 sm:col-span-2">Search
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="email, name or IP address" />
        </label>
        <label className="text-xs text-slate-400">Plan
          <select className={inputCls} value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }}>
            <option value="">All plans</option><option value="FREE">Free</option><option value="STANDARD">Standard</option><option value="PRO">Pro</option><option value="EXCLUSIVE">Exclusive</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">Sort by
          <select className={inputCls} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="newest">Newest</option><option value="lastLogin">Last login</option><option value="tokens">Most tokens</option><option value="logins">Most logins</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">Status
          <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option><option value="active">Active</option><option value="blocked">Blocked</option>
          </select>
        </label>
      </div>
      <ErrorBox message={error} />
      <Panel>
        {loading && !data && <Skeleton />}
        {data && data.users.length === 0 && <Empty>No users match.</Empty>}
        {data && data.users.length > 0 && (
          <Table head={["User", "Plan", "Tokens", "Builds", "Last login", "Last location", "Logins", "Joined"]}>
            {data.users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-800/40">
                <td className="px-3 py-2">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-slate-100 hover:underline">{u.email}</Link>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {u.name}
                    {u.blockedAt && <Badge tone="bad">blocked</Badge>}
                    {data.verificationOn && !u.verified && <Badge tone="warn">unverified</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2"><Badge tone={tierTone(u.tier)}>{u.tier}</Badge></td>
                <td className="px-3 py-2 tabular-nums">{fmt(u.tokenBalance)}</td>
                <td className="px-3 py-2 tabular-nums">{fmt(u.builds)}</td>
                <td className="px-3 py-2 text-slate-300">{ago(u.lastLoginAt)}</td>
                <td className="px-3 py-2 text-slate-300">{place(u.lastCountry, u.lastCity)}<div className="text-xs text-slate-500">{u.lastIp}</div></td>
                <td className="px-3 py-2 tabular-nums">{fmt(u.loginCount)}</td>
                <td className="px-3 py-2 text-slate-400">{ago(u.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
        {data && <Pager page={page} size={data.size} total={data.total} onPage={setPage} />}
      </Panel>
    </main>
  );
}
