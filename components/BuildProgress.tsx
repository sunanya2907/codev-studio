"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Database, Layers, Layout, Loader2, Server, ShieldCheck } from "lucide-react";

export type AgentKey = "spec" | "frontend" | "backend" | "database" | "qa";
export type AgentState = "waiting" | "working" | "retry" | "done";
export type AgentStatuses = Record<AgentKey, AgentState>;
export const IDLE_STATUSES: AgentStatuses = {
  spec: "waiting",
  frontend: "waiting",
  backend: "waiting",
  database: "waiting",
  qa: "waiting",
};

type Step = {
  key: AgentKey;
  name: string;
  working: string;
  icon: React.ElementType;
  weight: number; // share of the progress bar
  typical: number; // typical seconds, used only to move the bar smoothly while an agent works
  start: number; // fractions of the estimate, used only when we cannot see live events
  end: number;
};

const PAID: Step[] = [
  { key: "spec", name: "Agent 1 · SRS", working: "Writing the requirements, data model and API contract", icon: Layers, weight: 0.2, typical: 25, start: 0, end: 0.22 },
  { key: "frontend", name: "Agent 2 · Frontend", working: "Building the multi-page interface", icon: Layout, weight: 0.22, typical: 60, start: 0.22, end: 0.72 },
  { key: "backend", name: "Agent 3 · Backend", working: "Writing the API routes and validation", icon: Server, weight: 0.22, typical: 55, start: 0.22, end: 0.72 },
  { key: "database", name: "Agent 4 · Database", working: "Designing the database schema", icon: Database, weight: 0.12, typical: 25, start: 0.22, end: 0.72 },
  { key: "qa", name: "Agent 5 · QA & Security", working: "Reviewing the real code, then running code checks", icon: ShieldCheck, weight: 0.24, typical: 40, start: 0.72, end: 1 },
];
const FREE: Step[] = [
  { key: "spec", name: "Agent 1 · SRS", working: "Writing the requirements, data model and API contract", icon: Layers, weight: 0.4, typical: 25, start: 0, end: 0.38 },
  { key: "frontend", name: "Agent 2 · Frontend", working: "Building your app for the Live Preview", icon: Layout, weight: 0.6, typical: 60, start: 0.38, end: 1 },
];

const PAID_ESTIMATE = 150;
const FREE_ESTIMATE = 80;

export default function BuildProgress({
  free,
  statuses,
  startedAt,
  live,
}: {
  free: boolean;
  statuses: AgentStatuses;
  startedAt: number;
  /** true: statuses come from the server. false: we only know when it started (page reopened). */
  live: boolean;
}) {
  const steps = free ? FREE : PAID;
  const estimate = free ? FREE_ESTIMATE : PAID_ESTIMATE;
  const [now, setNow] = useState(() => Date.now());
  const agentStart = useRef<Partial<Record<AgentKey, number>>>({});

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const f = elapsed / estimate;

  // state of each agent: real (live events) or inferred from elapsed time (reopened page)
  const stateOf = (s: Step): AgentState => {
    if (live) return statuses[s.key];
    if (f >= s.end && s.end < 1) return "done";
    if (f >= s.start) return "working";
    return "waiting";
  };

  // remember when each agent started working, so its share of the bar can move smoothly
  steps.forEach((s) => {
    if (stateOf(s) !== "waiting" && agentStart.current[s.key] === undefined) agentStart.current[s.key] = now;
  });

  let percent = 0;
  for (const s of steps) {
    const st = stateOf(s);
    if (st === "done") percent += s.weight;
    else if (st === "working" || st === "retry") {
      const t = (now - (agentStart.current[s.key] ?? now)) / 1000;
      percent += s.weight * Math.min(0.92, t / s.typical);
    }
  }
  const shown = Math.min(97, Math.round(percent * 100));
  const mmss = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;
  const slow = elapsed > estimate;
  const working = steps.filter((s) => ["working", "retry"].includes(stateOf(s)));

  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-20 bg-[#0B0F19]/95 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-1">
          <Loader2 className="w-5 h-5 text-cyan-300 animate-spin" />
          <h3 className="text-lg font-extrabold text-white">Your agents are building your app</h3>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          {working.length > 0
            ? `${working.map((s) => s.name.split(" · ")[0]).join(", ")} ${working.length > 1 ? "are" : "is"} working right now.`
            : "Getting started…"}{" "}
          {slow
            ? "This one is taking longer than usual. Big ideas can need a few minutes."
            : `Usually takes about ${free ? "1 to 1.5" : "2 to 3"} minutes.`}{" "}
          You can close this tab; the build keeps running and appears in History.
        </p>

        <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 transition-[width] duration-500 ease-out relative overflow-hidden"
            style={{ width: `${Math.max(4, shown)}%` }}
          >
            <span className="absolute inset-0 bc-shimmer" />
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-5">
          <span>{shown}%</span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> {mmss} elapsed
          </span>
        </div>

        <ul className="space-y-2">
          {steps.map((s) => {
            const st = stateOf(s);
            const Icon = s.icon;
            const isDone = st === "done";
            const isWorking = st === "working" || st === "retry";
            const secs = isWorking ? Math.round((now - (agentStart.current[s.key] ?? now)) / 1000) : 0;
            return (
              <li
                key={s.key}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-all duration-500 ${
                  isDone
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : isWorking
                    ? "border-violet-500/60 bg-violet-500/10 shadow-[0_0_24px_-6px_rgba(139,92,246,0.6)]"
                    : "border-slate-800 bg-slate-900/50 opacity-60"
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isDone ? "bg-emerald-500/20 text-emerald-300" : isWorking ? "bg-violet-500/20 text-violet-200" : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4" /> : st === "retry" ? <AlertTriangle className="w-4 h-4 text-amber-300" /> : <Icon className={`w-4 h-4 ${isWorking ? "animate-pulse" : ""}`} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-white">{s.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {st === "retry" ? "Double-checking its own answer and fixing a problem…" : isDone ? "Finished" : s.working}
                  </span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  {isDone ? "Done" : isWorking ? `Working · ${secs}s` : "Waiting"}
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
