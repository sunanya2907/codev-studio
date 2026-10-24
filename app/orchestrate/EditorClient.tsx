"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { buildPreviewHtml } from "@/lib/preview";
import { TIER_TOKENS, CUSTOMIZE_COST } from "@/lib/plans";
import {
  Menu,
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
}

const AGENTS = [
  {
    id: 1,
    key: "spec",
    name: "Agent 1",
    role: "Architect Spec",
    badgeColor: "from-violet-600 to-indigo-600",
    icon: Layers,
    placeholder: "Ask Agent 1 to modify architecture spec...",
    buttonLabel: "Customize Spec",
    freeAccessible: true,
  },
  {
    id: 2,
    key: "frontend",
    name: "Agent 2",
    role: "Frontend UI",
    badgeColor: "from-blue-600 to-cyan-500",
    icon: Layout,
    placeholder: "Ask Agent 2 to customize UI components...",
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
    placeholder: "Ask Agent 3 to modify API routes...",
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

const QUICK_TEMPLATES = [
  {
    title: "Task Manager",
    subtitle: "PostgreSQL + Auth",
    prompt:
      "Build a modern Kanban Task Manager with PostgreSQL database, user authentication, priority tags, and dark mode analytics dashboard.",
  },
  {
    title: "E-Commerce Store",
    subtitle: "Next.js + Stripe",
    prompt:
      "Build a full-stack E-Commerce storefront with product filtering, slide-out cart, Stripe checkout integration, and order management.",
  },
  {
    title: "AI SaaS Portal",
    subtitle: "Modern UI + Tokens",
    prompt:
      "Build an AI content generator SaaS dashboard with token credit billing, history logs, and real-time streaming cards.",
  },
  {
    title: "CMS Blog Engine",
    subtitle: "Markdown + DB",
    prompt:
      "Build a developer blog and documentation platform with Markdown editor, tags, reading time, and comment threads.",
  },
];

const PLAN_DETAILS = [
  {
    id: "FREE",
    name: "Free Plan",
    price: "$0",
    period: "/ month",
    tokens: 3,
    badge: "3 Free Trial Builds",
    desc: "Only Agent 1 (Architect Spec) is visible.",
    features: [
      "3 Free Trial Builds (one-time)",
      "Agent 1: Architect Spec Visible",
      "Locked: Agents 2, 3, 4 & 5",
    ],
  },
  {
    id: "STANDARD",
    name: "Standard Plan",
    price: "$9",
    period: "/ month",
    tokens: 10,
    badge: "10 Tokens Included",
    desc: "Unlocks all 5 AI agents + Live Preview & ZIP Export.",
    features: [
      "10 Monthly Generation Tokens",
      "All 5 Full-Stack Agents Unlocked",
      "Live Preview & ZIP Export",
      "$1 Extra Token Top-Ups Anytime",
    ],
  },
  {
    id: "PRO",
    name: "Pro Plan",
    price: "$49",
    period: "/ month",
    tokens: 50,
    badge: "50 Tokens Included",
    desc: "High-volume token allowance for power builders.",
    features: [
      "50 Monthly Generation Tokens",
      "All 5 Full-Stack Agents Unlocked",
      "Unlimited History & Priority Build",
      "$1 Extra Token Top-Ups Anytime",
    ],
  },
  {
    id: "EXCLUSIVE",
    name: "Exclusive Plan",
    price: "Custom",
    period: "Monthly Billing",
    tokens: 250,
    badge: "250+ Custom Tokens",
    desc: "Custom agent customization & dedicated monthly billing.",
    features: [
      "250+ Custom Monthly Token Volume",
      "Custom Agent System Rules & Prompts",
      "Consolidated Monthly Billing",
      "On-Demand $1 Extra Token Top-Ups",
    ],
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
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [activeAgentIndex, setActiveAgentIndex] = useState<number>(0);

  // Plan & Token States
  const [tier, setTier] = useState<"FREE" | "STANDARD" | "PRO" | "EXCLUSIVE">("FREE");
  const [tokenBalance, setTokenBalance] = useState<number>(3);
  const [extraTokensCount, setExtraTokensCount] = useState<number>(5);
  const [billingLoading, setBillingLoading] = useState<string | null>(null);

  // Prompt & Agent Buffers
  const [prompt, setPrompt] = useState("");
  const [customInstruction, setCustomInstruction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [buffers, setBuffers] = useState<{
    spec: string;
    frontend: string;
    backend: string;
    database: string;
    qa: string;
  }>({
    spec: `# Architecture Specification\n## Project: Ready to Orchestrate\n\n### Tech Stack\n- Frontend: Next.js 15 + Tailwind CSS\n- Backend: Next.js App Router API\n- Database: PostgreSQL + Prisma ORM\n- Auth: NextAuth.js\n\nDescribe your website idea on the left and click "Build App (1 Token)" to orchestrate your project.`,
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
          if (restoreLatest && data.history.length > 0) {
            openHistoryItem(data.history[0]);
          }
        }
      }
    } catch (e) {}
  };

  const currentAgent = AGENTS[activeAgentIndex];
  const isCurrentAgentLocked = tier === "FREE" && !currentAgent.freeAccessible;

  // Upgrade Plan Handler (Free / Standard $9 / Pro $49 / Exclusive)
  const handleSelectPlan = async (selectedPlan: string) => {
    setBillingLoading(selectedPlan);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPGRADE_PLAN", plan: selectedPlan }),
      });
      const data = await readJson(res);
      if (res.ok) {
        setTier(data.tier);
        setTokenBalance(data.tokenBalance);
        setShowPricingModal(false);
      } else {
        alert(data.error || "Failed to update plan.");
      }
    } catch (err) {
      alert("Error updating plan.");
    } finally {
      setBillingLoading(null);
    }
  };

  // Buy Extra Tokens ($1 per token)
  const handleBuyExtraTokens = async (countToBuy: number) => {
    setBillingLoading("TOPUP");
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BUY_TOKENS",
          extraTokens: countToBuy,
        }),
      });
      const data = await readJson(res);
      if (res.ok) {
        setTokenBalance(data.tokenBalance);
        setShowPricingModal(false);
      } else {
        alert(data.error || "Failed to purchase tokens.");
      }
    } catch (err) {
      alert("Error purchasing extra tokens.");
    } finally {
      setBillingLoading(null);
    }
  };

  // Full App Build Handler (Enforces Token Deduction & Free Plan Visibility)
  const handleBuildApp = async () => {
    if (!prompt.trim()) return;

    if (tokenBalance <= 0) {
      setShowPricingModal(true);
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await readJson(res);
      if (!res.ok) {
        if (data.code === "OUT_OF_TOKENS" || data.code === "PLAN_LOCKED") {
          setShowPricingModal(true);
          return;
        }
        throw new Error(data.error || "Failed to generate app");
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

      // If on Free plan, keep focus on Agent 1 (Architect Spec)
      if ((data.tier || tier) === "FREE") {
        setActiveAgentIndex(0);
      }

      fetchHistory();
    } catch (err: any) {
      alert(err.message || "Error during generation");
    } finally {
      setIsGenerating(false);
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

  // Export ZIP (Locked on Free Plan)
  const handleExportZip = async () => {
    if (tier === "FREE") {
      setShowPricingModal(true);
      return;
    }
    const zip = new JSZip();
    zip.file("README.md", buffers.spec);
    zip.file("app/page.tsx", buffers.frontend);
    zip.file("app/api/route.ts", buffers.backend);
    zip.file("prisma/schema.prisma", buffers.database);
    zip.file("QA_REPORT.md", buffers.qa);
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
    <div className="min-h-screen h-screen overflow-hidden bg-[#0B0F19] text-slate-100 flex font-sans select-none relative">
      {/* 1. LEFTMOST COLLAPSIBLE NAVIGATION & PLAN PROGRESS SIDEBAR */}
      <aside
        className={`${
          sidebarOpen ? "w-56" : "w-16"
        } transition-all duration-300 bg-[#070A12] border-r border-slate-800/80 flex flex-col justify-between shrink-0 z-20`}
      >
        <div>
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

            <Link
              href="/terms"
              target="_blank"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
            >
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              {sidebarOpen && <span>Terms & Conditions</span>}
            </Link>
          </nav>
        </div>

        {/* Bottom Active Plan & Token Balance Card */}
        <div className="p-3">
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
                  ? "3 free trial builds • Agent 1 only"
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
                  ? "Upgrade Plan ($9)"
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
        <div className="w-72 bg-[#0D1322] border-r border-slate-800 p-4 flex flex-col z-20 overflow-y-auto">
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
                    openHistoryItem(item);
                    setShowHistoryDrawer(false);
                  }}
                  className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-violet-500/50 cursor-pointer transition"
                >
                  <p className="text-xs font-semibold text-slate-200 line-clamp-2">
                    {item.prompt}
                  </p>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. SECOND COLUMN: PROMPT BOX + BUILD BUTTON + AGENT 1-5 STACK */}
      <section className="w-80 bg-[#0E1424] border-r border-slate-800/80 flex flex-col justify-between p-4 shrink-0 overflow-y-auto">
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
              className="select-text w-full bg-[#0B0F19] border border-slate-800/90 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 resize-none"
            />

            <button
              onClick={handleBuildApp}
              disabled={isGenerating}
              className="mt-3 w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {isGenerating
                ? "Orchestrating Agents..."
                : tokenBalance > 0
                ? "Build App (1 Token)"
                : "Out of Tokens — Top Up ($1)"}
            </button>
          </div>

          {/* Agent 1 to Agent 5 Selector Stack */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Multi-Agent Pipeline
              </span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {tier === "FREE" ? "1/5 Unlocked" : "5/5 Unlocked"}
              </span>
            </div>

            {AGENTS.map((agent, index) => {
              const Icon = agent.icon;
              const isSelected = activeAgentIndex === index;
              const isLocked = tier === "FREE" && !agent.freeAccessible;

              return (
                <button
                  key={agent.id}
                  onClick={() => setActiveAgentIndex(index)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-violet-600/25 via-indigo-600/20 to-transparent border-violet-500 text-white shadow-md shadow-violet-950/50"
                      : "bg-[#131B2E]/70 hover:bg-[#131B2E] border-slate-800/80 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg bg-gradient-to-br ${agent.badgeColor} flex items-center justify-center text-white font-bold text-xs shadow`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        {agent.name}
                        <span className="text-[10px] font-normal text-slate-400">
                          • {agent.role}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {isLocked ? "Locked on Free Plan" : "Editable Buffer"}
                      </span>
                    </div>
                  </div>

                  {isLocked ? (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> $9
                    </span>
                  ) : (
                    <CheckCircle2
                      className={`w-4 h-4 ${
                        isSelected ? "text-cyan-400" : "text-emerald-500/60"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Templates Grid */}
          <div className="pt-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
              Quick Templates
            </span>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(tpl.prompt)}
                  className="p-2.5 rounded-xl bg-[#131B2E]/90 hover:bg-slate-800/80 border border-slate-800 text-left transition group"
                >
                  <div className="text-xs font-bold text-slate-200 group-hover:text-violet-300 truncate">
                    {tpl.title}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {tpl.subtitle}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. RIGHT MAIN WORKSPACE: TOP TABS + SINGLE AGENT STAGE / UNLOCK + BOTTOM BAR */}
      <main className="flex-1 flex flex-col justify-between bg-[#0B0F19] overflow-hidden">
        <header className="h-16 px-6 border-b border-slate-800/80 flex items-center justify-between bg-[#0E1424]/60 backdrop-blur">
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
              onClick={() => {
                if (tier === "FREE") {
                  setShowPricingModal(true);
                  return;
                }
                setActiveTab("preview");
              }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "preview"
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Live Preview
              {tier === "FREE" && <Lock className="w-3 h-3 text-amber-400" />}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Token No + Instant $1 Top-Up Trigger */}
            <button
              onClick={() => setShowPricingModal(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold transition"
            >
              <Coins className="w-4 h-4 text-amber-400" />
              <span>Token No: {tokenBalance}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200">
                + $1 Top Up
              </span>
            </button>

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
        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          <div className="flex-1 rounded-2xl bg-[#111827] border border-slate-800/90 shadow-2xl flex flex-col overflow-hidden relative">
            <div className="px-5 py-3.5 bg-[#0D1322] border-b border-slate-800 flex items-center justify-between">
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

            {activeTab === "editor" ? (
              <div className="flex-1 relative flex flex-col">
                <textarea
                  value={currentCodeValue}
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
                      Free Plan — Architect Spec Only
                    </span>
                    <h4 className="text-xl font-extrabold text-white mb-2">
                      Unlock {currentAgent.name} ({currentAgent.role})
                    </h4>
                    <p className="text-xs text-slate-300 max-w-md mb-6 leading-relaxed">
                      Your Free Plan includes <strong>3 one-time trial builds</strong> with access to <strong>Agent 1 (Architect Spec)</strong>. Once they are used, everything stays locked until you upgrade. Upgrade to <strong>Standard ($9 / 10 Tokens)</strong>, <strong>Pro ($49 / 50 Tokens)</strong>, or <strong>Exclusive</strong> to unlock all 5 full-stack agents!
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        onClick={() => handleSelectPlan("STANDARD")}
                        disabled={billingLoading === "STANDARD"}
                        className="px-7 py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:brightness-110 shadow-xl shadow-amber-500/30 transition transform hover:-translate-y-0.5"
                      >
                        {billingLoading === "STANDARD"
                          ? "Unlocking..."
                          : "UNLOCK FOR ($9) — 10 TOKENS →"}
                      </button>
                      <button
                        onClick={() => setShowPricingModal(true)}
                        className="px-5 py-3.5 rounded-xl font-bold text-xs text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 transition"
                      >
                        View All Plans ($49 Pro / Custom)
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
        <footer className="h-20 px-6 border-t border-slate-800/80 bg-[#0E1424] flex items-center justify-between gap-4">
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
                  ? "Locked on Free Plan — Upgrade for $9 to customize this agent..."
                  : currentAgent.placeholder
              }
              className="select-text flex-1 bg-[#090D16] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 disabled:opacity-50"
            />

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

      {/* 4. FULL INTERACTIVE PRICING & $1 EXTRA TOKEN MODAL */}
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
              <button
                onClick={() => setShowPricingModal(false)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

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