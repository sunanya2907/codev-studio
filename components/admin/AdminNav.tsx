"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApi } from "@/components/admin/ui";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/logins", label: "Logins and locations" },
  { href: "/admin/activity", label: "Activity and searches" },
  { href: "/admin/integrations", label: "API keys and AI usage" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/testers", label: "Tester links" },
  { href: "/admin/debug", label: "Errors" },
];

export default function AdminNav({ email }: { email: string }) {
  const path = usePathname();
  const { data } = useApi<{ counts: Record<string, number> }>("/api/admin/requests?status=PENDING");
  const pending = data?.counts?.PENDING ?? 0;
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));

  return (
    <aside className="border-b border-slate-800 bg-[#0B0F19] lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:py-5">
        <div>
          <div className="text-lg font-extrabold tracking-tight">
            Build<span className="text-cyan-400">_</span><span className="text-violet-400">Core</span>
          </div>
          <div className="text-[11px] uppercase tracking-widest text-slate-500">Admin</div>
        </div>
        <Link href="/orchestrate" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 lg:mt-4 lg:inline-block">
          Back to app
        </Link>
      </div>
      <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active(l.href) ? "page" : undefined}
            className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              active(l.href) ? "bg-violet-600/20 text-violet-200" : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            {l.label}
            {l.href === "/admin/requests" && pending > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-black">{pending}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="hidden px-4 py-4 text-[11px] text-slate-500 lg:absolute lg:bottom-0 lg:block">Signed in as<br /><span className="break-all text-slate-300">{email}</span></div>
    </aside>
  );
}
