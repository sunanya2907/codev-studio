"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { MailCheck, Loader2 } from "lucide-react";

export default function VerifyClient() {
  const [code, setCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const started = useRef(false);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/verify/send", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.status === 501) {
        // Email is not set up on the server: verification is off, so just continue.
        window.location.href = "/orchestrate";
        return;
      }
      if (!res.ok) {
        setError(d?.error || "We could not send the email. Please try again.");
        return;
      }
      if (d.verified) {
        window.location.href = "/orchestrate";
        return;
      }
      if (d.email) setMaskedEmail(d.email);
      setCooldown(Number(d.cooldownSeconds) || 60);
      setInfo(d.alreadySent ? "We already sent a code. Check your inbox (and spam)." : "We sent a 6-digit code. It works for 10 minutes.");
    } catch {
      setError("Network problem. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }, []);

  // Send the first code as soon as the page opens (the server never sends two within a minute).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
  }, [send]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace(/\s/g, "").length !== 6) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/verify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.href = "/orchestrate";
        return;
      }
      setError(d?.error || "That code did not work.");
      if (d?.code === "EXPIRED" || d?.code === "LOCKED" || d?.code === "NO_CODE") setCode("");
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#05070d] text-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 mb-4">
          <MailCheck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-extrabold">Check your email</h1>
        <p className="mt-2 text-sm text-slate-400">
          {maskedEmail ? <>We sent a 6-digit code to <span className="text-slate-200 font-semibold">{maskedEmail}</span>.</> : "We are sending you a 6-digit code…"}{" "}
          Enter it to continue to your account.
        </p>

        <form onSubmit={confirm} className="mt-6 space-y-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123 456"
            aria-label="6-digit verification code"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] text-white outline-none focus:border-cyan-400 select-text"
          />
          {info && !error && <p className="text-xs text-emerald-400">{info}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={checking || code.replace(/\s/g, "").length !== 6}
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 py-3 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {checking && <Loader2 className="h-4 w-4 animate-spin" />} Verify and continue
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
          <button onClick={() => void send()} disabled={sending || cooldown > 0} className="hover:text-white disabled:opacity-50">
            {cooldown > 0 ? `Resend code in ${cooldown}s` : sending ? "Sending…" : "Resend code"}
          </button>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="hover:text-white">
            Use a different account
          </button>
        </div>
      </div>
    </main>
  );
}
