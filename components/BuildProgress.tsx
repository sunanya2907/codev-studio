"use client";

import React, { useEffect, useState } from "react";
import { Check, Clock, Database, Layers, Layout, Loader2, Server, ShieldCheck } from "lucide-react";

type Step = { name: string; label: string; icon: React.ElementType; start: number; end: number };

// start/end are fractions of the estimated total time. Agents 2, 3 and 4 run in parallel.
const PAID_STEPS: Step[] = [
  { name: "Agent 1", label: "Writing the SRS (requirements, data model, API)", icon: Layers, start: 0, end: 0.25 },
  { name: "Agent 2", label: "Building the multi-page frontend", icon: Layout, start: 0.25, end: 0.8 },
  { name: "Agent 3", label: "Writing the backend API routes", icon: Server, start: 0.25, end: 0.8 },
  { name: "Agent 4", label: "Designing the database schema", icon: Database, start: 0.25, end: 0.8 },
  { name: "Agent 5", label: "Reviewing the real code for bugs and security", icon: ShieldCheck, start: 0.8, end: 1 },
];
const FREE_STEPS: Step[] = [
  { name: "Agent 1", label: "Writing the SRS (requirements, data model, API)", icon: Layers, start: 0, end: 0.35 },
  { name: "Agent 2", label: "Building your app for the Live Preview", icon: Layout, start: 0.35, end: 1 },
];

// Rough averages. They are estimates, shown as such. Bigger ideas can take longer.
const PAID_ESTIMATE_SECONDS = 100;
const FREE_ESTIMATE_SECONDS = 50;

export default function BuildProgress({ free }: { free: boolean }) {
  const steps = free ? FREE_STEPS : PAID_STEPS;
  const estimate = free ? FREE_ESTIMATE_SECONDS : PAID_ESTIMATE_SECONDS;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(id);
  }, []);

  const f = elapsed / estimate; // 1 = the estimate has passed
  const overtime = f >= 1;
  const percent = Math.min(95, Math.round(f * 95));
  const left = Math.max(0, Math.ceil(estimate - elapsed));
  const mmss = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-20 bg-[#0B0F19]/95 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-1">
          <Loader2 className="w-5 h-5 text-cyan-300 animate-spin" />
          <h3 className="text-lg font-extrabold text-white">Your agents are building your app</h3>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          {overtime
            ? "Taking a little longer than usual. Bigger ideas can need up to 3 minutes. Please keep this tab open."
            : `Usually takes about ${free ? "1 minute" : "1 to 2 minutes"}. Please keep this tab open until it finishes.`}
        </p>

        <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(4, percent)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-5">
          <span>{percent}%</span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            {mmss} elapsed {overtime ? "• almost there…" : `• about ${left}s left (estimate)`}
          </span>
        </div>

        <ul className="space-y-2">
          {steps.map((s) => {
            const done = f >= s.end && !(overtime && s.end === 1);
            const active = !done && f >= s.start;
            const Icon = s.icon;
            return (
              <li
                key={s.name}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                  done
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : active
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-slate-800 bg-slate-900/50 opacity-60"
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    done ? "bg-emerald-500/20 text-emerald-300" : active ? "bg-violet-500/20 text-violet-200" : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {done ? <Check className="w-4 h-4" /> : <Icon className={`w-4 h-4 ${active ? "animate-pulse" : ""}`} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-white">{s.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{s.label}</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {done ? "Done" : active ? "Working…" : "Waiting"}
                </span>
              </li>
            );
          })}
        </ul>

        {free && (
          <p className="text-[11px] text-slate-500 mt-4">
            Free plan builds your app for the Live Preview. Upgrade to also get the full code, backend, database and QA review.
          </p>
        )}
      </div>
    </div>
  );
}
