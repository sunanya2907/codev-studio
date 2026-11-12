"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { buildPreviewHtml } from "@/lib/preview";
import { parseFiles, cleanPath } from "@/lib/files";
import { scaffoldFiles } from "@/lib/scaffold";
import {
  TIER_TOKENS,
  CUSTOMIZE_COST,
  STANDARD_PRICE_LABEL,
  PRO_PRICE_LABEL,
  FREE_TRIAL_BUILDS,
  VOICE_PRICE_LABEL,
  VOICE_TOKEN_LABEL,
} from "@/lib/plans";
import { startCheckout, contactForExclusive } from "@/lib/billing-client";
import PaymentMethodToggle from "@/components/PaymentMethodToggle";
import { PLAN_DETAILS } from "@/lib/plan-details";
import BuildProgress, { IDLE_STATUSES, type AgentStatuses } from "@/components/BuildProgress";
import VoiceBuilder, { type ApplyResult } from "@/components/VoiceBuilder";
import DomainSearch from "@/components/DomainSearch";
import BuildQuestions, { type BuildQuestion } from "@/components/BuildQuestions";
import type { PaymentProvider } from "@/lib/plans";
import {
  Menu,
  Mic,
  Sparkles,
  History,
  Coins,
  Lock,
  ChevronLeft,
  ChevronRight,
  Send,
  Download,
  Code2,
  Eye,
  CheckCircle2,
  Layers,
  Layout,
  Server,
  Database,
  ShieldCheck,
  Copy,
  Check,
  Zap,
  Plus,
  X,
  Crown,
  FileText,
  Globe,
} from "lucide-react";

interface HistoryItem {
  id: string;
  prompt: string;
  spec: string;
  frontend: string;
  backend: string;
  database: string;
  qa?: string;
  createdAt: string;
  status?: string; // BUILDING | DONE | FAILED
  error?: string | null;
}

// What a free user sees instead of code. The real code never reaches the editor box.
const LOCKED_TEXT = "// Locked on Free Plan.\n// Your Live Preview works. Upgrade to view, copy, edit and export the code.";

const AGENTS = [
  {
    id: 1,
    key: "spec",
    name: "Agent 1",
    role: "SRS Document",
    badgeColor: "from-violet-600 to-indigo-600",
    icon: Layers,
    placeholder: "Ask Agent 1 to change the SRS (requirements, data model, API)...",
    buttonLabel: "Customize SRS",
    freeAccessible: false,
  },
  {
    id: 2,
    key: "frontend",
    name: "Agent 2",
    role: "Frontend UI",
    badgeColor: "from-blue-600 to-cyan-500",
    icon: Layout,
    placeholder: "Ask Agent 2 to change pages or components...",
    buttonLabel: "Customize UI",
    freeAccessible: false,
  },
  {
    id: 3,
    key: "backend",
    name: "Agent 3",
    role: "Backend API",
    badgeColor: "from-emerald-600 to-teal-500",
    icon: Server,
    placeholder: "Ask Agent 3 to change or add API routes...",
    buttonLabel: "Customize API",
    freeAccessible: false,
  },
  {
    id: 4,
    key: "database",
    name: "Agent 4",
    role: "Database Schema",
    badgeColor: "from-amber-500 to-orange-500",
    icon: Database,
    placeholder: "Ask Agent 4 to update Prisma/SQL schema...",
    buttonLabel: "Customize DB",
    freeAccessible: false,
  },
  {
    id: 5,
    key: "qa",
    name: "Agent 5",
    role: "Security & Deploy QA",
    badgeColor: "from-pink-600 to-rose-500",
    icon: ShieldCheck,
    placeholder: "Ask Agent 5 to audit security & deployment...",
    buttonLabel: "Customize QA",
    freeAccessible: false,
  },
];

// If the server times out, Vercel answers with an HTML error page instead of JSON.
// Calling res.json() on that throws "Unexpected token '<'" - show something readable instead.
async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {
      error:
        res.status === 504 || res.status === 408
          ? "The request timed out. Please try again."
          : `Server error (${res.status}). Please try again.`,
    };
  }
}

export default function EditorClient({
  userName = "Developer",
}: {
  userName?: string;
}) {
  // Navigation & View States
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false);
  }, []);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [activeAgentIndex, setActiveAgentIndex] = useState<number>(0);

  // Plan & Token States
  const [tier, setTier] = useState<"FREE" | "STANDARD" | "PRO" | "EXCLUSIVE">("FREE");
  const [tokenBalance, setTokenBalance] = useState<number>(3);
  const [extraTokensCount, setExtraTokensCount] = useState<number>(5);
  const [billingLoading, setBillingLoading] = useState<string | null>(null);
  const [provider, setProvider] = useState<PaymentProvider>("razorpay");

  // Prompt & Agent Buffers
  const [prompt, setPrompt] = useState("");
  const [showVoice, setShowVoice] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"build" | "edit">("build");
  const [customInstruction, setCustomInstruction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false); // full build only (shows the progress screen)
  const [agentStatus, setAgentStatus] = useState<AgentStatuses>(IDLE_STATUSES);
  const [buildStartedAt, setBuildStartedAt] = useState(() => Date.now());
  const [buildLive, setBuildLive] = useState(true); // false when we reopened the page mid-build
  const watching = React.useRef(false);
  const [copied, setCopied] = useState(false);

  const [buffers, setBuffers] = useState<{
    spec: string;
    frontend: string;
    backend: string;
    database: string;
    qa: string;
  }>({
    spec: `# Software Requirements Specification\n## Project: Ready to Orchestrate\n\n### Tech Stack\n- Frontend: Next.js 15 + Tailwind CSS\n- Backend: Next.js App Router API\n- Database: PostgreSQL + Prisma ORM\n- Auth: NextAuth.js\n\nDescribe your website idea on the left and click "Build App (1 Token)" to orchestrate your project.`,
    frontend: `export default function GeneratedApp() {\n  return (\n    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">\n      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-center">\n        <span className="px-3 py-1 text-xs font-semibold bg-violet-500/20 text-violet-300 rounded-full">Live Preview Ready</span>\n        <h1 className="text-2xl font-bold mt-4">Build_Core Dynamic App</h1>\n        <p className="text-slate-400 text-sm mt-2">Enter an app idea on the left and click Build to render your live interactive UI here.</p>\n      </div>\n    </div>\n  );\n}`,
    backend: `import { NextResponse } from "next/server";\n\nexport async function GET() {\n  return NextResponse.json({ status: "ok", message: "Agent 3 Backend API Ready" });\n}`,
    database: `model Item {\n  id        String   @id @default(cuid())\n  title     String\n  completed Boolean  @default(false)\n  createdAt DateTime @default(now())\n}`,
    qa: `# Security & Deployment Audit (Agent 5)\n- [x] Environment variables isolated\n- [x] Prisma SQL injection protection verified\n- [x] NextAuth session middleware active\n- [x] Ready for zero-config Vercel production build`,
  });

  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  // The saved generation currently open in the editor; edits are saved back to it.
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  const openHistoryItem = (item: HistoryItem) => {
    setPrompt(item.prompt);
    setCurrentHistoryId(item.id);
    setBuffers((prev) => ({
      ...prev,
      spec: item.spec,
      frontend: item.frontend,
      backend: item.backend,
      database: item.database,
      qa:
        item.qa ||
        "# Agent 5 QA Report\n\nNo QA report was saved for this generation.",
    }));
  };

  const maxTokensForPlan = TIER_TOKENS[tier];

  useEffect(() => {
    // Back from Stripe Checkout: the webhook may take a few seconds to credit the account.
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      window.history.replaceState(null, "", window.location.pathname);
      fetch("/api/billing")
        .then((r) => (r.ok ? r.json() : null))
        .then((before) => {
          if (before) pollBillingUntilChanged(before);
        })
        .catch(() => {});
    } else if (params.get("checkout")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    fetchBillingStatus();
    fetchHistory(true); // true => reopen the most recent project after a refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBillingStatus = async () => {
    try {
      const res = await fetch("/api/billing");
      if (res.ok) {
        const data = await res.json();
        if (data.tier) setTier(data.tier);
        if (typeof data.tokenBalance === "number") {
          setTokenBalance(data.tokenBalance);
        }
      }
    } catch (e) {}
  };

  const fetchHistory = async (restoreLatest = false) => {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.history)) {
          setHistoryList(data.history);
          const finished = data.history.find((h: HistoryItem) => !h.status || h.status === "DONE");
          if (restoreLatest && finished) openHistoryItem(finished);
          // A build is still running on the server (tab was closed or refreshed): follow it.
          const running = data.history.find((h: HistoryItem) => h.status === "BUILDING");
          if (restoreLatest && running) watchRunningBuild(new Date(running.createdAt).getTime());
        }
      }
    } catch (e) {}
  };

  // Follows a build that is running on the server without a live connection to it.
  const watchRunningBuild = async (startedAt: number) => {
    if (watching.current) return;
    watching.current = true;
    setBuildStartedAt(startedAt);
    setBuildLive(false);
    setIsBuilding(true);
    setIsGenerating(true);
    try {
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const res = await fetch("/api/history?light=1").catch(() => null);
        if (!res || !res.ok) continue;
        const data = await res.json();
        const latest = Array.isArray(data.history) ? data.history[0] : null;
        if (!latest || latest.status === "BUILDING") continue;
        if (latest.status === "FAILED") alert(latest.error || "The build failed. Your token was returned.");
        await fetchHistory(latest.status === "DONE");
        await fetchBillingStatus();
        return;
      }
    } finally {
      watching.current = false;
      setIsBuilding(false);
      setIsGenerating(false);
    }
  };

  const currentAgent = AGENTS[activeAgentIndex];
  const isCurrentAgentLocked = tier === "FREE" && !currentAgent.freeAccessible;

  // Waits for Stripe's webhook to credit the plan/tokens (usually 1-5 seconds).
  const pollBillingUntilChanged = async (before: { tier: string; tokenBalance: number }) => {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch("/api/billing");
        if (!res.ok) continue;
        const d = await res.json();
        if (d.tier !== before.tier || d.tokenBalance !== before.tokenBalance) {
          setTier(d.tier);
          setTokenBalance(d.tokenBalance);
          return;
        }
      } catch {}
    }
  };

  // Upgrade Plan Handler (Standard $9 / Pro $49 via Stripe; Exclusive = contact us)
  const handleSelectPlan = async (selectedPlan: string) => {
    if (selectedPlan === "FREE") {
      setShowPricingModal(false);
      return;
    }
    if (selectedPlan === "EXCLUSIVE") {
      contactForExclusive();
      return;
    }
    setBillingLoading(selectedPlan);
    const before = { tier, tokenBalance };
    const result = await startCheckout({ action: "PLAN", plan: selectedPlan }, provider);
    if (result.kind === "demo") {
      setTier(result.tier as typeof tier);
      setTokenBalance(result.tokenBalance);
      setShowPricingModal(false);
    } else if (result.kind === "switched") {
      setShowPricingModal(false);
      await pollBillingUntilChanged(before);
    } else if (result.kind === "error") {
      alert(result.error);
    }
    // "redirect": the browser is already on its way to Stripe.
    setBillingLoading(null);
  };

  // Buy Extra Tokens ($1 per token, paid through Stripe Checkout)
  const handleBuyExtraTokens = async (countToBuy: number) => {
    setBillingLoading("TOPUP");
    const result = await startCheckout({ action: "TOKENS", tokens: countToBuy }, provider);
    if (result.kind === "demo") {
      setTokenBalance(result.tokenBalance);
      setShowPricingModal(false);
    } else if (result.kind === "error") {
      alert(result.error);
    }
    setBillingLoading(null);
  };

  // Paid users: Stripe's customer portal (cancel, invoices, card).
  const handleManageSubscription = async () => {
    setBillingLoading("PORTAL");
    const result = await startCheckout({ action: "PORTAL" });
    if (result.kind === "error") alert(result.error);
    setBillingLoading(null);
  };

  // Full App Build Handler (Enforces Token Deduction & Free Plan Visibility)
  // Step 1: ask 3 questions about the idea (free), then build with the answers.
  const [buildQuestions, setBuildQuestions] = useState<BuildQuestion[] | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const handleBuildApp = async () => {
    if (!prompt.trim() || isAsking) return;

    if (tokenBalance <= 0) {
      setShowPricingModal(true);
      return;
    }

    setIsAsking(true);
    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.questions) && data.questions.length > 0) {
        setBuildQuestions(data.questions);
        return;
      }
    } catch {
      // fall through: build straight from the idea
    } finally {
      setIsAsking(false);
    }
    runBuild(prompt);
  };

  // Step 2: the person answered (or skipped): build with the idea plus the answers.
  const handleAnswersSubmit = (answers: { question: string; answer: string }[]) => {
    setBuildQuestions(null);
    const extra = answers.map((a) => `${a.question} ${a.answer}`).join(" | ");
    runBuild(extra ? `${prompt.trim()}\n\nUser needs: ${extra}` : prompt);
  };

  const runBuild = async (finalPrompt: string) => {
    if (!finalPrompt.trim()) return;

    setIsGenerating(true);
    setIsBuilding(true);
    setAgentStatus(IDLE_STATUSES);
    setBuildStartedAt(Date.now());
    setBuildLive(true);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt }),
      });

      let data: any;
      if (res.ok && res.body && (res.headers.get("content-type") || "").includes("ndjson")) {
        // Live progress: one JSON line per event, the last line is the finished build.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let failure: string | null = null;
        data = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let ev: any;
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.type === "agent") {
              setAgentStatus((prev) => ({
                ...prev,
                [ev.agent]: ev.status === "start" ? "working" : ev.status === "retry" ? "retry" : "done",
              }));
            } else if (ev.type === "done") data = ev;
            else if (ev.type === "error") failure = ev.error;
          }
        }
        if (failure) throw new Error(failure);
        if (!data) {
          // The connection dropped but the server keeps building: follow it from the database.
          watchRunningBuild(Date.now());
          return;
        }
      } else {
        data = await readJson(res);
        if (!res.ok) {
          if (data.code === "OUT_OF_TOKENS" || data.code === "PLAN_LOCKED") {
            setShowPricingModal(true);
            return;
          }
          throw new Error(data.error || "Failed to generate app");
        }
      }

      setBuffers({
        spec: data.spec || buffers.spec,
        frontend: data.frontend || buffers.frontend,
        backend: data.backend || buffers.backend,
        database: data.database || buffers.database,
        qa:
          data.qa ||
          `# Agent 5 QA Report\n- [x] Verified Spec & API routes for: "${prompt.slice(0, 40)}..."\n- [x] Production build checks passed.`,
      });

      if (typeof data.historyId === "string") {
        setCurrentHistoryId(data.historyId);
      }

      if (typeof data.tokenBalance === "number") {
        setTokenBalance(data.tokenBalance);
      } else {
        setTokenBalance((prev) => Math.max(0, prev - 1));
      }

      if (data.tier) {
        setTier(data.tier);
      }

      // Free plan: show the running app; the code stays locked
      if ((data.tier || tier) === "FREE") {
        setActiveAgentIndex(0);
        setActiveTab("preview");
      }

      fetchHistory();
    } catch (err: any) {
      alert(err.message || "Error during generation");
      fetchBillingStatus(); // the token of a failed build was returned
    } finally {
      if (!watching.current) {
        setIsGenerating(false);
        setIsBuilding(false);
      }
    }
  };

  // Single-Agent Customize Handler (Bottom Bar)
  const handleCustomizeAgent = async () => {
    if (isCurrentAgentLocked) {
      setShowPricingModal(true);
      return;
    }
    if (!customInstruction.trim()) return;

    // Customizing costs tokens (same as the server enforces).
    if (tokenBalance < CUSTOMIZE_COST) {
      setShowPricingModal(true);
      return;
    }

    setIsGenerating(true);
    try {
      const key = currentAgent.key as keyof typeof buffers;
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || "Update current module",
          agent: currentAgent.key,
          currentCode: buffers[key],
          instruction: customInstruction,
          historyId: currentHistoryId,
        }),
      });

      const data = await readJson(res);
      if (!res.ok) {
        if (data.code === "PLAN_LOCKED" || data.code === "OUT_OF_TOKENS") {
          setShowPricingModal(true);
          return;
        }
        throw new Error(data.error || "Failed to customize agent");
      }

      const updatedValue =
        data.updatedCode || data[key] || data.spec || buffers[key];
      setBuffers((prev) => ({
        ...prev,
        [key]: updatedValue,
      }));
      if (typeof data.tokenBalance === "number") {
        setTokenBalance(data.tokenBalance);
      }
      setCustomInstruction("");
    } catch (e: any) {
      alert(e.message || "Failed to customize");
    } finally {
      setIsGenerating(false);
    }
  };

  // "Talk to edit": open the voice panel (editing is a paid feature, like Customize).
  const openVoiceEdit = () => {
    if (tier === "FREE") {
      setShowPricingModal(true);
      return;
    }
    setVoiceMode("edit");
    setShowVoice(true);
  };

  // Short summary of the current app, so the voice AI knows what it is changing.
  const voiceContext = `Requirements:\n${buffers.spec.slice(0, 1800)}\n\nCurrent page code (start):\n${buffers.frontend.slice(0, 1200)}`;

  // Called by the voice panel when the person says "apply". Same call and cost as Customize.
  const applyVoiceEdit = async (agentKey: string, instruction: string): Promise<ApplyResult> => {
    const agent = AGENTS.find((a) => a.key === agentKey) ?? AGENTS[1];
    const key = agent.key as keyof typeof buffers;
    if (tier === "FREE") {
      setShowPricingModal(true);
      return { ok: false, message: "Editing needs a paid plan. Please upgrade first." };
    }
    if (tokenBalance < CUSTOMIZE_COST) {
      setShowPricingModal(true);
      return { ok: false, message: `Applying a change needs ${CUSTOMIZE_COST} token and you have none left. Please buy a token, then say apply again.` };
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || "Update current module",
          agent: key,
          currentCode: buffers[key],
          instruction,
          historyId: currentHistoryId,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        if (data.code === "PLAN_LOCKED" || data.code === "OUT_OF_TOKENS") setShowPricingModal(true);
        return { ok: false, message: data.error || "The change failed. Please try again." };
      }
      const updated = data.updatedCode || data[key] || data.spec || buffers[key];
      setBuffers((prev) => ({ ...prev, [key]: updated }));
      if (typeof data.tokenBalance === "number") setTokenBalance(data.tokenBalance);
      setActiveAgentIndex(AGENTS.findIndex((a) => a.key === key));
      return { ok: true, message: `Done. I updated the ${agent.role}. Check the result, or tell me the next change.` };
    } catch (e: any) {
      return { ok: false, message: e?.message || "The change failed. Please try again." };
    } finally {
      setIsGenerating(false);
    }
  };

  // Export ZIP (Locked on Free Plan)
  const handleExportZip = async () => {
    if (tier === "FREE") {
      setShowPricingModal(true);
      return;
    }
    const zip = new JSZip();
    const appName =
      (buffers.spec.match(/^#\s+(?:Software Requirements Specification:?\s*)?(.+)$/m)?.[1] || "").trim() ||
      "My App";

    // 1) fixed project files, so the ZIP can be run with npm install && npm run dev
    for (const f of scaffoldFiles(appName)) zip.file(f.path, f.content);
    // 2) documents
    zip.file("SRS.md", buffers.spec);
    zip.file("QA_REPORT.md", buffers.qa);
    // 3) generated code (written last, so it can override a scaffold file if it must)
    for (const f of parseFiles(buffers.frontend, "app/page.tsx")) {
      const path = cleanPath(f.path);
      if (path) zip.file(path, f.content);
    }
    for (const f of parseFiles(buffers.backend, "app/api/route.ts")) {
      const path = cleanPath(f.path);
      if (path) zip.file(path, f.content);
    }
    zip.file("prisma/schema.prisma", buffers.database);
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "build-core-app.zip");
  };

  const handleCopyCode = () => {
    if (isCurrentAgentLocked) {
      setShowPricingModal(true);
      return;
    }
    const key = currentAgent.key as keyof typeof buffers;
    navigator.clipboard.writeText(buffers[key]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Re-compiled only when the generated frontend changes (not on every keystroke elsewhere),
  // so typing in the prompt box never reloads the running preview.
  const previewHtml = useMemo(
    () => buildPreviewHtml(buffers.frontend),
    [buffers.frontend]
  );

  const currentCodeValue = buffers[currentAgent.key as keyof typeof buffers];
  const usagePercent = Math.min(
    100,
    Math.round((tokenBalance / maxTokensForPlan) * 100)
  );

  return (
    <div className="h-[100dvh] overflow-y-auto lg:overflow-hidden bg-[#0B0F19] text-slate-100 flex flex-col lg:flex-row font-sans select-none relative">
      {/* 1. LEFTMOST COLLAPSIBLE NAVIGATION & PLAN PROGRESS SIDEBAR */}
      <aside
        className={`${
          sidebarOpen ? "lg:w-64 max-h-[75vh]" : "lg:w-16 max-h-16"
        } w-full lg:max-h-none overflow-hidden transition-all duration-300 bg-[#070A12] border-b lg:border-b-0 lg:border-r border-slate-800/80 flex flex-col justify-between shrink-0 z-20`}
      >
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
                title="Toggle Menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              {sidebarOpen && (
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-violet-200 to-cyan-300 bg-clip-text text-transparent">
                    Build_Core
                  </span>
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                    {tier}
                  </span>
                </div>
              )}
            </div>
          </div>

          <nav className="p-3 space-y-1.5">
            <button
              onClick={() => setShowHistoryDrawer(false)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                !showHistoryDrawer
                  ? "bg-gradient-to-r from-violet-600/30 to-indigo-600/20 text-white border border-violet-500/40 shadow-lg shadow-violet-600/10"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <Zap className="w-4 h-4 text-violet-400 shrink-0" />
              {sidebarOpen && <span>FUSE Orchestrator</span>}
            </button>

            <button
              onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                showHistoryDrawer
                  ? "bg-gradient-to-r from-violet-600/30 to-indigo-600/20 text-white border border-violet-500/40"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <History className="w-4 h-4 text-cyan-400 shrink-0" />
                {sidebarOpen && <span>History</span>}
              </div>
              {sidebarOpen && (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-slate-800 text-cyan-300">
                  {historyList.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowPricingModal(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-amber-300 hover:text-white hover:bg-amber-500/10 border border-transparent hover:border-amber-500/30 transition"
            >
              <Coins className="w-4 h-4 text-amber-400 shrink-0" />
              {sidebarOpen && <span>Plans & $1 Tokens</span>}
            </button>

            <button
              onClick={() => setShowDomainModal(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-cyan-300 hover:text-white hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/30 transition"
            >
              <Globe className="w-4 h-4 text-cyan-300 shrink-0" />
              {sidebarOpen && <span>Find a Domain</span>}
            </button>

            <Link
              href="/terms"
              target="_blank"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
            >
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              {sidebarOpen && <span>Terms & Conditions</span>}
            </Link>
          </nav>

          {/* MULTI-AGENT PIPELINE (hides/shrinks with the sidebar) */}
          <div className="px-3 pb-3 pt-1 space-y-1.5">
            {sidebarOpen ? (
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Multi-Agent Pipeline
                </span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {tier === "FREE" ? "1/5" : "5/5"}
                </span>
              </div>
            ) : (
              <div className="border-t border-slate-800/80 mb-2" />
            )}

            {AGENTS.map((agent, index) => {
              const Icon = agent.icon;
              const isSelected = activeAgentIndex === index;
              const isLocked = tier === "FREE" && !agent.freeAccessible;

              return (
                <button
                  key={agent.id}
                  onClick={() => setActiveAgentIndex(index)}
                  title={`${agent.name} • ${agent.role}${isLocked ? " (Locked)" : ""}`}
                  className={`w-full flex items-center ${
                    sidebarOpen ? "justify-between px-2.5 py-2" : "justify-center p-1.5"
                  } rounded-xl border text-left transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-violet-600/25 via-indigo-600/20 to-transparent border-violet-500 text-white shadow-md shadow-violet-950/50"
                      : "bg-[#131B2E]/70 hover:bg-[#131B2E] border-slate-800/80 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`relative w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br ${agent.badgeColor} flex items-center justify-center text-white shadow`}
                    >
                      <Icon className="w-4 h-4" />
                      {!sidebarOpen && isLocked && (
                        <Lock className="absolute -top-1 -right-1 w-3 h-3 text-amber-400 bg-[#070A12] rounded-full p-[1px]" />
                      )}
                    </div>
                    {sidebarOpen && (
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">
                          {agent.name}
                          <span className="text-[10px] font-normal text-slate-400">
                            {" "}• {agent.role}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {isLocked ? "Locked on Free Plan" : "Editable Buffer"}
                        </span>
                      </div>
                    )}
                  </div>

                  {sidebarOpen &&
                    (isLocked ? (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-semibold flex items-center gap-1">
                        <Lock className="w-3 h-3" /> {STANDARD_PRICE_LABEL}
                      </span>
                    ) : (
                      <CheckCircle2
                        className={`shrink-0 w-4 h-4 ${
                          isSelected ? "text-cyan-400" : "text-emerald-500/60"
                        }`}
                      />
                    ))}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Active Plan & Token Balance Card */}
        <div className="p-3 shrink-0">
          {sidebarOpen ? (
            <div className="rounded-2xl bg-gradient-to-b from-slate-900/95 to-[#0B0F19] border border-slate-800 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {tier === "FREE" ? "Free Plan" : `${tier} Plan`}
                </span>
                <span
                  className={`text-[11px] font-bold ${
                    tokenBalance === 0 ? "text-rose-400" : "text-amber-400"
                  }`}
                >
                  {tokenBalance} / {maxTokensForPlan} left
                </span>
              </div>

              <p className="text-[11px] text-slate-400 mb-2.5">
                {tier === "FREE"
                  ? `${FREE_TRIAL_BUILDS} free trial builds • Live Preview only`
                  : "All 5 AI Agents Unlocked"}
              </p>

              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-3.5">
                <div
                  className={`h-full transition-all duration-500 ${
                    tokenBalance === 0
                      ? "bg-rose-500"
                      : "bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400"
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>

              <button
                onClick={() => setShowPricingModal(true)}
                className="w-full py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:brightness-110 shadow-lg shadow-violet-600/25 transition"
              >
                {tier === "FREE"
                  ? `Upgrade Plan (${STANDARD_PRICE_LABEL})`
                  : "+ Buy $1 Extra Token"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPricingModal(true)}
              className="w-full py-3 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-amber-400"
              title={`${tokenBalance} Tokens left - Click to Upgrade`}
            >
              <Coins className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* SLIDE-OUT HISTORY DRAWER */}
      {showHistoryDrawer && (
        <div className="w-full lg:w-72 max-h-[60vh] lg:max-h-none bg-[#0D1322] border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col z-20 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold flex items-center gap-2 text-cyan-300">
              <History className="w-4 h-4" /> Saved Generations
            </h3>
            <button
              onClick={() => setShowHistoryDrawer(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
          {historyList.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              No builds archived yet. Click &quot;Build App&quot; to create your first project!
            </p>
          ) : (
            <div className="space-y-2.5">
              {historyList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.status === "BUILDING") return;
                    if (item.status === "FAILED") {
                      alert(item.error || "This build failed. Your token was returned.");
                      return;
                    }
                    openHistoryItem(item);
                    setShowHistoryDrawer(false);
                  }}
                  className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-violet-500/50 cursor-pointer transition"
                >
                  <p className="text-xs font-semibold text-slate-200 line-clamp-2">
                    {item.prompt}
                  </p>
                  <span className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                    {new Date(item.createdAt).toLocaleDateString()}
                    {item.status === "BUILDING" && (
                      <span className="px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-bold animate-pulse">Building…</span>
                    )}
                    {item.status === "FAILED" && (
                      <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">Failed · token returned</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. SECOND COLUMN: PROMPT BOX + BUILD BUTTON + AGENT 1-5 STACK */}
      <section className="w-full lg:w-80 bg-[#0E1424] border-b lg:border-b-0 lg:border-r border-slate-800/80 flex flex-col justify-between p-4 shrink-0 lg:overflow-y-auto">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              Build_Core Studio
            </h2>
            <p className="text-[11px] text-slate-400">
              5-Agent Autonomous Architecture
            </p>
          </div>

          <div className="bg-[#131B2E] border border-slate-800 rounded-2xl p-3.5 shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Describe the Website Idea
              </label>
              <span className="text-[10px] text-slate-500">
                {prompt.length}/500
              </span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="e.g. A task manager with PostgreSQL database, user auth, and analytics..."
              className="select-text w-full bg-[#0B0F19] border border-slate-800/90 rounded-xl p-3 text-base sm:text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 resize-none"
            />

            <div className="mt-3 flex items-stretch gap-2">
              <button
                onClick={handleBuildApp}
                disabled={isGenerating || isAsking}
                className="flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {isAsking
                  ? "Preparing questions..."
                  : isGenerating
                  ? "Orchestrating Agents..."
                  : tokenBalance > 0
                  ? "Build App (1 Token)"
                  : "Out of Tokens — Top Up ($1)"}
              </button>

              {/* Talk to build: icon-only mic button */}
              <button
                type="button"
                onClick={() => {
                  setVoiceMode("build");
                  setShowVoice(true);
                }}
                title={`Talk to build · ${VOICE_PRICE_LABEL} (${VOICE_TOKEN_LABEL})`}
                aria-label={`Talk to build · ${VOICE_PRICE_LABEL} (${VOICE_TOKEN_LABEL})`}
                className="shrink-0 w-11 rounded-xl bg-[#1F1F1F] hover:bg-[#2B2B2B] border border-white/10 text-white transition active:scale-95 flex items-center justify-center"
              >
                <Mic className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. RIGHT MAIN WORKSPACE: TOP TABS + SINGLE AGENT STAGE / UNLOCK + BOTTOM BAR */}
      <main className="w-full min-w-0 min-h-[100dvh] lg:min-h-0 lg:flex-1 flex flex-col justify-between bg-[#0B0F19] lg:overflow-hidden">
        <header className="min-h-16 px-3 sm:px-6 py-2 gap-2 flex-wrap border-b border-slate-800/80 flex items-center justify-between bg-[#0E1424]/60 backdrop-blur">
          <div className="flex items-center gap-2 bg-[#090D16] p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("editor")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "editor"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Code Editor
            </button>

            <button
              onClick={() => setActiveTab("preview")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "preview"
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Live Preview
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportZip}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export ZIP
            </button>

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-800 text-xs text-slate-300">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center font-bold text-white text-xs">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium truncate max-w-[120px]">
                {userName}
              </span>
            </div>
          </div>
        </header>

        {/* CENTER STAGE: Active Agent Header + Code/Preview or UNLOCK FOR ($9) Overlay */}
        <div className="flex-1 min-h-[70vh] lg:min-h-0 p-3 sm:p-6 overflow-hidden flex flex-col">
          <div className="flex-1 rounded-2xl bg-[#111827] border border-slate-800/90 shadow-2xl flex flex-col overflow-hidden relative">
            <div className="px-3 sm:px-5 py-3.5 gap-2 flex-wrap bg-[#0D1322] border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider text-white bg-gradient-to-r ${currentAgent.badgeColor} shadow`}
                >
                  {currentAgent.name}
                </span>
                <h3 className="text-sm font-bold text-white">
                  {currentAgent.role} {isCurrentAgentLocked ? "(Locked on Free Plan)" : "(Editable)"}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Buffer
                    </>
                  )}
                </button>
              </div>
            </div>

            {isBuilding && (
              <BuildProgress free={tier === "FREE"} statuses={agentStatus} startedAt={buildStartedAt} live={buildLive} />
            )}

            {activeTab === "editor" ? (
              <div className="flex-1 relative flex flex-col">
                <textarea
                  value={isCurrentAgentLocked ? LOCKED_TEXT : currentCodeValue}
                  onChange={(e) => {
                    if (isCurrentAgentLocked) return;
                    const key = currentAgent.key as keyof typeof buffers;
                    setBuffers((prev) => ({ ...prev, [key]: e.target.value }));
                  }}
                  readOnly={isCurrentAgentLocked}
                  className={`select-text w-full flex-1 bg-[#090D16] p-5 font-mono text-xs leading-relaxed text-cyan-100 focus:outline-none resize-none ${
                    isCurrentAgentLocked ? "blur-md select-none opacity-30" : ""
                  }`}
                />

                {/* UNLOCK FOR ($9) OVERLAY ON AGENTS 2, 3, 4, 5 FOR FREE PLAN */}
                {isCurrentAgentLocked && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-10">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-500/20 mb-4">
                      <Lock className="w-7 h-7" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold uppercase tracking-wider mb-2">
                      Free Plan — Live Preview Only
                    </span>
                    <h4 className="text-xl font-extrabold text-white mb-2">
                      Unlock the code: {currentAgent.name} ({currentAgent.role})
                    </h4>
                    <p className="text-xs text-slate-300 max-w-md mb-6 leading-relaxed">
                      Your Free Plan includes <strong>{FREE_TRIAL_BUILDS} one-time trial builds</strong> where you can run your app in the <strong>Live Preview</strong>. Viewing, copying, editing and exporting the code needs a paid plan. Upgrade to <strong>Standard ({STANDARD_PRICE_LABEL} / {TIER_TOKENS.STANDARD} Tokens)</strong>, <strong>Pro ({PRO_PRICE_LABEL} / {TIER_TOKENS.PRO} Tokens)</strong>, or <strong>Exclusive</strong> to unlock all 5 agents and the full code!
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        onClick={() => handleSelectPlan("STANDARD")}
                        disabled={billingLoading === "STANDARD"}
                        className="px-7 py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:brightness-110 shadow-xl shadow-amber-500/30 transition transform hover:-translate-y-0.5"
                      >
                        {billingLoading === "STANDARD"
                          ? "Unlocking..."
                          : `UNLOCK FOR (${STANDARD_PRICE_LABEL}) — ${TIER_TOKENS.STANDARD} TOKENS →`}
                      </button>
                      <button
                        onClick={() => setShowPricingModal(true)}
                        className="px-5 py-3.5 rounded-xl font-bold text-xs text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 transition"
                      >
                        View All Plans ({PRO_PRICE_LABEL} Pro / Custom)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 bg-[#090D16] relative">
                <iframe
                  title="Live App Preview"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts allow-modals"
                  className="w-full h-full border-0"
                />
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM NAVIGATION & CUSTOMIZE BAR: [Back] [Next] [Customize Spec] */}
        <footer className="min-h-20 px-3 sm:px-6 py-3 flex-wrap border-t border-slate-800/80 bg-[#0E1424] flex items-center justify-between gap-3 sm:gap-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() =>
                setActiveAgentIndex((prev) => Math.max(0, prev - 1))
              }
              disabled={activeAgentIndex === 0}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-xs font-bold text-slate-200 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <button
              onClick={() =>
                setActiveAgentIndex((prev) =>
                  Math.min(AGENTS.length - 1, prev + 1)
                )
              }
              disabled={activeAgentIndex === AGENTS.length - 1}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-xs font-bold text-slate-200 transition"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 max-w-2xl flex items-center gap-3">
            <input
              type="text"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              disabled={isCurrentAgentLocked || isGenerating}
              placeholder={
                isCurrentAgentLocked
                  ? `Code is locked on the Free Plan — upgrade for ${STANDARD_PRICE_LABEL} to edit...`
                  : currentAgent.placeholder
              }
              className="select-text flex-1 min-w-[10rem] bg-[#090D16] border border-slate-800 rounded-xl px-4 py-2.5 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 disabled:opacity-50"
            />

            <button
              onClick={openVoiceEdit}
              title={`Talk to edit · ${VOICE_PRICE_LABEL} (${VOICE_TOKEN_LABEL})`}
              aria-label="Talk to edit"
              className="p-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 transition shrink-0"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              onClick={handleCustomizeAgent}
              disabled={isGenerating}
              className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-violet-600 to-cyan-500 hover:brightness-110 transition shadow-lg shadow-violet-600/20 flex items-center gap-2 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              {currentAgent.buttonLabel}
              {!isCurrentAgentLocked && (
                <span className="text-[10px] font-semibold opacity-80">
                  ({CUSTOMIZE_COST} Token)
                </span>
              )}
            </button>
          </div>
        </footer>
      </main>

      <BuildQuestions
        open={!!buildQuestions}
        idea={prompt}
        questions={buildQuestions || []}
        onCancel={() => setBuildQuestions(null)}
        onSubmit={handleAnswersSubmit}
      />

      <VoiceBuilder
        key={voiceMode}
        open={showVoice}
        mode={voiceMode}
        context={voiceContext}
        onClose={() => setShowVoice(false)}
        onApply={(text) => setPrompt(text.slice(0, 500))}
        onApplyEdit={applyVoiceEdit}
        onBalanceChange={(n) => setTokenBalance(n)}
        onNeedTokens={() => {
          setShowVoice(false);
          setShowPricingModal(true);
        }}
      />

      {/* 4. FULL INTERACTIVE PRICING & $1 EXTRA TOKEN MODAL */}
      {showDomainModal && <DomainSearch onClose={() => setShowDomainModal(false)} />}

      {showPricingModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0E1424] border border-slate-800 rounded-3xl max-w-5xl w-full p-6 md:p-8 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5" /> Build_Core Plans & Token Billing
                </span>
                <h3 className="text-2xl font-extrabold text-white mt-1">
                  Unlock All 5 AI Agents or Top Up Extra Tokens ($1)
                </h3>
              </div>
              {tier !== "FREE" && (
                <button
                  onClick={handleManageSubscription}
                  disabled={billingLoading === "PORTAL"}
                  className="mr-3 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 disabled:opacity-50"
                >
                  {billingLoading === "PORTAL" ? "Opening..." : "Manage subscription"}
                </button>
              )}
              <button
                onClick={() => setShowPricingModal(false)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <PaymentMethodToggle value={provider} onChange={setProvider} />

            {/* 4 Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {PLAN_DETAILS.map((plan) => {
                const isCurrent = tier === plan.id;
                const isPopular = plan.id === "STANDARD" || plan.id === "PRO";
                return (
                  <div
                    key={plan.id}
                    className={`rounded-2xl p-5 flex flex-col justify-between border transition ${
                      plan.id === "PRO"
                        ? "bg-gradient-to-b from-violet-950/50 to-slate-900 border-violet-500 shadow-lg shadow-violet-500/10"
                        : plan.id === "STANDARD"
                        ? "bg-slate-900/90 border-amber-500/50"
                        : "bg-slate-900/50 border-slate-800"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-base text-white">
                          {plan.name}
                        </h4>
                        {isPopular && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {plan.id === "STANDARD" ? "Best Value" : "Popular"}
                          </span>
                        )}
                      </div>

                      <div className="my-3">
                        <span className="text-3xl font-extrabold text-white">
                          {plan.price}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">
                          {plan.period}
                        </span>
                      </div>

                      <div className="inline-block px-2.5 py-1 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[11px] font-bold mb-3">
                        {plan.badge}
                      </div>

                      <p className="text-xs text-slate-400 mb-4">{plan.desc}</p>

                      <ul className="space-y-2 text-xs text-slate-200 mb-6">
                        {plan.features.map((f, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => handleSelectPlan(plan.id)}
                      disabled={isCurrent || billingLoading === plan.id}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                        isCurrent
                          ? "bg-slate-800 text-slate-400 cursor-default"
                          : plan.id === "STANDARD"
                          ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:brightness-110"
                          : "bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110"
                      }`}
                    >
                      {billingLoading === plan.id
                        ? "Activating..."
                        : isCurrent
                        ? "Active Plan"
                        : `Select ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Extra Token ($1 Each) Instant Top-Up Bar */}
            <div className="rounded-2xl bg-[#090D16] border border-amber-500/40 p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <Coins className="w-4 h-4" />
                  <span>Need More Tokens This Month? Buy Extra Tokens for $1 Each</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Finished your monthly plan tokens early? Top up extra tokens instantly at <strong>$1 per token</strong> without changing your subscription.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={extraTokensCount}
                    onChange={(e) =>
                      setExtraTokensCount(Math.max(1, Number(e.target.value)))
                    }
                    className="w-14 bg-transparent text-center font-bold text-sm text-white focus:outline-none"
                  />
                  <span className="text-xs text-slate-400 ml-1">Tokens</span>
                </div>

                <button
                  onClick={() => handleBuyExtraTokens(extraTokensCount)}
                  disabled={billingLoading === "TOPUP"}
                  className="px-5 py-2.5 rounded-xl font-extrabold text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-110 flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition"
                >
                  <Plus className="w-4 h-4" />
                  {billingLoading === "TOPUP"
                    ? "Adding..."
                    : `Buy for $${extraTokensCount * 1}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}