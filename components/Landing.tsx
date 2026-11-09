"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  ArrowRight,
  Check,
  Database,
  Globe,
  Layers,
  Layout,
  Lock,
  Mail,
  Mic,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { PLAN_DETAILS } from "@/lib/plan-details";
import { FREE_TRIAL_BUILDS } from "@/lib/plans";

// Auth.js reports failures as short codes. Turn them into something a person can act on.
const AUTH_ERRORS: Record<string, string> = {
  CredentialsSignin: "Incorrect email or password. If you signed up with Google, use the Google button instead.",
  password_too_short: "New accounts need a password of at least 8 characters.",
  OAuthAccountNotLinked:
    "This email is already registered with a different sign-in method. Please sign in the way you first signed up.",
  AccessDenied: "Access denied.",
  Configuration: "Sign-in is temporarily unavailable because of a server configuration problem. Please try again later.",
};
const friendlyError = (code?: string | null) => (code && AUTH_ERRORS[code]) || "Sign-in failed. Please try again.";

const WORDS = ["SaaS dashboard", "online store", "booking app", "portfolio site", "CRM", "marketplace"];

const AGENTS = [
  { icon: Layers, name: "Agent 1", title: "Requirements (SRS)", text: "Turns your idea into a real specification: features, data model, API contract and page list.", tone: "from-violet-500 to-indigo-500" },
  { icon: Layout, name: "Agent 2", title: "Frontend", text: "Builds the whole multi-page interface with components, forms and states you can click through live.", tone: "from-sky-500 to-cyan-400" },
  { icon: Server, name: "Agent 3", title: "Backend", text: "Writes the API routes with validation, login and per-user data protection.", tone: "from-emerald-500 to-teal-400" },
  { icon: Database, name: "Agent 4", title: "Database", text: "Designs the schema with relations and indexes, matching the SRS exactly.", tone: "from-amber-500 to-orange-400" },
  { icon: ShieldCheck, name: "Agent 5", title: "QA & Security", text: "Reviews the real code, then Build_Core runs automatic checks that frontend, API and database agree.", tone: "from-pink-500 to-rose-400" },
];

/** Adds .bc-in when the element scrolls into view. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("bc-in");
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("bc-in");
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`bc-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <span key={i} className="bc-word bc-grad-text bg-gradient-to-r from-violet-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
      {WORDS[i]}
    </span>
  );
}

/** A looping preview of what the real build screen looks like. */
function LiveBuildMock() {
  const rows = [
    { icon: Layers, label: "Agent 1 · Writing the SRS" },
    { icon: Layout, label: "Agent 2 · Building the frontend" },
    { icon: Server, label: "Agent 3 · Writing the API" },
    { icon: Database, label: "Agent 4 · Designing the database" },
    { icon: ShieldCheck, label: "Agent 5 · Reviewing the code" },
  ];
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0B1020]/90 backdrop-blur p-4 shadow-2xl" aria-hidden="true">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-2 text-[10px] font-mono text-slate-500">build_core · live build</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-3">
        <div className="bc-bar h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400" />
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const Icon = r.icon;
          return (
            <div
              key={r.label}
              className="bc-row flex items-center gap-3 rounded-xl border px-3 py-2"
              style={{ animationDelay: `${i * 1.6}s` }}
            >
              <span className="relative w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                <Icon className="w-3.5 h-3.5" />
                <span className="bc-working absolute inset-0 rounded-lg ring-2 ring-violet-400/70" style={{ animationDelay: `${i * 1.6}s` }} />
                <span className="bc-done absolute inset-0 rounded-lg bg-emerald-500 text-white flex items-center justify-center" style={{ animationDelay: `${i * 1.6}s` }}>
                  <Check className="w-3.5 h-3.5" />
                </span>
              </span>
              <span className="text-[11px] font-semibold text-slate-200">{r.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Landing({ builds }: { builds: number | null }) {
  const [accepted, setAccepted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google / redirect-based failures come back as /?error=<code>
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(friendlyError(code));
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) return;
    setLoading(true);
    setError(null);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.error) setError(friendlyError(res.code ?? res.error));
      else window.location.href = "/workspace";
    } catch {
      setError("Authentication failed. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#05070d] text-white overflow-x-hidden">
      {/* animated background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="bc-orb-a absolute -top-40 -left-32 w-[46rem] h-[46rem] rounded-full bg-violet-600/25 blur-[140px]" />
        <div className="bc-orb-b absolute top-1/3 -right-40 w-[42rem] h-[42rem] rounded-full bg-cyan-500/20 blur-[140px]" />
        <div className="bc-orb-c absolute -bottom-40 left-1/4 w-[40rem] h-[40rem] rounded-full bg-indigo-600/20 blur-[140px]" />
        <div className="bc-grid absolute inset-0" />
      </div>

      {/* nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500">
            <Zap className="h-4 w-4" />
            <span className="bc-ring absolute inset-0 rounded-lg border border-cyan-300/60" />
          </span>
          Build_Core
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
          <a href="#agents" className="hover:text-white transition">Agents</a>
          <a href="#how" className="hover:text-white transition">How it works</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
          <a href="#start" className="rounded-full border border-slate-700 px-4 py-1.5 hover:border-cyan-400 hover:text-white transition">Sign in</a>
        </nav>
      </header>

      {/* hero */}
      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <span className="bc-rise inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-[11px] font-mono uppercase tracking-widest text-cyan-300" style={{ animationDelay: "0.05s" }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            AI software engineering
          </span>
          <h1 className="bc-rise mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl" style={{ animationDelay: "0.15s" }}>
            Describe your idea.<br />
            Five agents build your<br />
            <span className="inline-block min-h-[1.15em]"><RotatingWord /></span>
          </h1>
          <p className="bc-rise mt-6 max-w-xl text-base leading-relaxed text-slate-400" style={{ animationDelay: "0.3s" }}>
            Build_Core writes the requirements, the frontend, the backend and the database, then reviews its own work.
            You watch a live preview while it builds. Type your idea, or just talk to it.
          </p>

          <div className="bc-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.45s" }}>
            <a href="#start" className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-3 text-sm font-bold shadow-lg shadow-violet-600/30 transition hover:brightness-110">
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a href="#how" className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900/60">
              See how it works
            </a>
          </div>

          <ul className="bc-rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400" style={{ animationDelay: "0.6s" }}>
            <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> {FREE_TRIAL_BUILDS} free builds, no card needed</li>
            <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Live preview while it builds</li>
            <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Pay with UPI, cards or wallets</li>
          </ul>
        </div>

        <div className="bc-rise bc-float lg:justify-self-end w-full max-w-md" style={{ animationDelay: "0.35s" }}>
          <LiveBuildMock />
        </div>
      </section>

      {/* live number, only shown when it is real and meaningful */}
      {builds !== null && builds >= 10 && (
        <Reveal className="relative z-10 mx-auto -mt-8 mb-14 max-w-6xl px-6">
          <p className="text-center text-sm text-slate-400">
            <span className="font-extrabold text-white">{builds.toLocaleString("en-IN")}</span> apps built on Build_Core so far
          </p>
        </Reveal>
      )}

      {/* agents */}
      <section id="agents" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <p className="text-xs font-mono uppercase tracking-widest text-cyan-300">The pipeline</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Five agents, one connected result</h2>
          <p className="mt-3 max-w-2xl text-slate-400">
            The SRS is the shared contract: the frontend, the API and the database are all built from the same names and
            shapes, so the pieces fit together.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a, i) => {
            const Icon = a.icon;
            return (
              <Reveal key={a.name} delay={i * 90}>
                <div className="group h-full rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur transition hover:-translate-y-1 hover:border-slate-600">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${a.tone} shadow-lg transition group-hover:scale-110`}>
                    <Icon className="h-5 w-5 text-white" />
                  </span>
                  <p className="mt-4 text-[11px] font-mono uppercase tracking-widest text-slate-500">{a.name}</p>
                  <h3 className="mt-1 text-lg font-bold">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{a.text}</p>
                </div>
              </Reveal>
            );
          })}
          <Reveal delay={5 * 90}>
            <div className="h-full rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-5 backdrop-blur">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800">
                <Mic className="h-5 w-5 text-cyan-300" />
              </span>
              <p className="mt-4 text-[11px] font-mono uppercase tracking-widest text-slate-500">Also</p>
              <h3 className="mt-1 text-lg font-bold">Talk to build</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">Describe the app out loud and answer a few spoken questions. Build_Core turns it into your prompt.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* how */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <p className="text-xs font-mono uppercase tracking-widest text-cyan-300">How it works</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">From idea to a running app in minutes</h2>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { n: "01", icon: Sparkles, t: "Describe it", d: "Type or say what you want. One build costs one token." },
            { n: "02", icon: Layers, t: "Watch it build", d: "See each agent start and finish in real time, with a live preview of your app." },
            { n: "03", icon: Globe, t: "Use the result", d: "Paid plans get the full code, a QA report and a runnable ZIP. Find a domain from inside the editor." },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={s.n} delay={i * 120}>
                <div className="relative h-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur">
                  <span className="absolute right-5 top-4 text-4xl font-extrabold text-slate-800">{s.n}</span>
                  <Icon className="h-6 w-6 text-violet-300" />
                  <h3 className="mt-4 text-lg font-bold">{s.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.d}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* pricing (numbers come from lib/plans.ts) */}
      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <p className="text-xs font-mono uppercase tracking-widest text-cyan-300">Pricing</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Start free. Pay only when you need the code.</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_DETAILS.map((p, i) => (
            <Reveal key={p.id} delay={i * 90}>
              <div className={`h-full rounded-2xl border p-5 backdrop-blur ${p.tag ? "border-violet-500/50 bg-violet-500/5" : "border-slate-800 bg-slate-900/60"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{p.name}</h3>
                  {p.tag && <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-200">{p.tag}</span>}
                </div>
                <p className="mt-3 text-3xl font-extrabold">{p.price}<span className="text-xs font-medium text-slate-500"> {p.period}</span></p>
                <p className="mt-1 text-xs font-semibold text-cyan-300">{p.badge}</p>
                <ul className="mt-4 space-y-2 text-xs text-slate-300">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />{f}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Prices in US dollars. In India you can also pay in rupees with UPI, cards and wallets at checkout.
        </p>
      </section>

      {/* sign in */}
      <section id="start" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-10">
        <Reveal>
          <div className="mx-auto max-w-md">
            <div className="bc-card-glow rounded-3xl bg-neutral-900/90 p-8 shadow-2xl backdrop-blur">
              <h2 className="mb-1 text-xl font-bold">Get started</h2>
              <p className="mb-6 text-xs text-neutral-400">Create an account or sign in to build your apps.</p>

              <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-left">
                <label className="flex cursor-pointer select-none items-start gap-2.5 text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-neutral-700 bg-neutral-900 accent-cyan-400"
                  />
                  <span className="leading-relaxed">
                    I agree to the{" "}
                    <Link href="/terms" target="_blank" className="font-medium text-cyan-400 underline">Terms &amp; Conditions</Link>{" "}
                    (including AI agent training data usage).
                  </span>
                </label>
              </div>

              {error && (
                <div role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-left text-xs leading-relaxed text-rose-200">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={!accepted}
                onClick={() => signIn("google", { callbackUrl: "/workspace" })}
                className={`mb-4 flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow transition-all ${
                  accepted ? "cursor-pointer bg-white text-neutral-900 hover:bg-neutral-100" : "cursor-not-allowed bg-neutral-800 text-neutral-500 opacity-60"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" data-help="Google|Sign in with your Google account. No new password needed.">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>

              <div className="relative flex items-center py-3">
                <div className="flex-grow border-t border-neutral-800" />
                <span className="mx-4 flex-shrink text-[10px] uppercase tracking-wider text-neutral-500">Or email &amp; password</span>
                <div className="flex-grow border-t border-neutral-800" />
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3 text-left">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-neutral-400">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                    <input type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 pl-9 pr-3 text-xs text-white focus:border-cyan-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-neutral-400">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                    <input type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 pl-9 pr-3 text-xs text-white focus:border-cyan-500 focus:outline-none" />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!accepted || loading}
                  className={`mt-2 w-full rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition ${
                    accepted && !loading ? "cursor-pointer bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-600/20 hover:brightness-110" : "cursor-not-allowed bg-neutral-800 text-neutral-600"
                  }`}
                >
                  {loading ? "Processing..." : "Sign Up / Sign In with Email"}
                </button>
              </form>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="relative z-10 border-t border-slate-900 px-6 py-8 text-center text-[11px] font-mono uppercase tracking-widest text-slate-600">
        Build intelligently. Ship confidently.
        <span className="mx-3">·</span>
        <Link href="/terms" className="hover:text-slate-400">Terms</Link>
        <span className="mx-3">·</span>
        <Link href="/pricing" className="hover:text-slate-400">Pricing</Link>
      </footer>
    </main>
  );
}
