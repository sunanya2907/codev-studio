"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

type State =
  | { s: "working" }
  | { s: "signin" }
  | { s: "error"; msg: string }
  | { s: "done"; tier: string; tokens: number; expiresAt: string | null; note?: string };

export default function TesterClient() {
  const code = useSearchParams().get("code") ?? "";
  const router = useRouter();
  const [state, setState] = useState<State>({ s: "working" });
  const started = useRef(false); // React strict mode runs effects twice; redeem only once

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!code) {
      setState({ s: "error", msg: "This link has no tester code." });
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/tester/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) return setState({ s: "signin" });
        if (!res.ok) return setState({ s: "error", msg: data.error || "Could not redeem the link." });
        setState({ s: "done", tier: data.tier, tokens: data.tokenBalance, expiresAt: data.expiresAt, note: data.note });
      } catch {
        setState({ s: "error", msg: "Could not reach the server." });
      }
    })();
  }, [code]);

  return (
    <main className="min-h-screen bg-[#070A12] text-white flex items-center justify-center p-4">
      <div className="bg-[#0E1424] border border-slate-800 rounded-3xl max-w-md w-full p-8 shadow-2xl text-center">
        <h1 className="text-2xl font-extrabold mb-3">Tester access</h1>

        {state.s === "working" && <p className="text-sm text-slate-300">Activating your access…</p>}

        {state.s === "signin" && (
          <>
            <p className="text-sm text-slate-300 mb-5">
              Sign in (or create an account) first, then open this same link again to activate your free access.
            </p>
            <Link href="/" className="inline-block w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-xs font-bold uppercase tracking-wider">
              Go to sign in
            </Link>
          </>
        )}

        {state.s === "error" && <p className="text-sm text-red-400">{state.msg}</p>}

        {state.s === "done" && (
          <>
            <p className="text-sm text-slate-300 mb-1">
              You now have the <strong>{state.tier}</strong> plan with <strong>{state.tokens}</strong> tokens.
            </p>
            {state.expiresAt && (
              <p className="text-xs text-slate-400 mb-1">
                Access ends {new Date(state.expiresAt).toLocaleDateString()}.
              </p>
            )}
            {state.note && <p className="text-xs text-amber-400 mb-1">{state.note}</p>}
            <button
              onClick={() => router.push("/orchestrate")}
              className="mt-5 w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-xs font-bold uppercase tracking-wider"
            >
              Open the studio
            </button>
          </>
        )}
      </div>
    </main>
  );
}
