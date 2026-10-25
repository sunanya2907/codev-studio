"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, Coins, Crown, Plus, X } from "lucide-react";
import { startCheckout, contactForExclusive } from "@/lib/billing-client";
import PaymentMethodToggle from "@/components/PaymentMethodToggle";
import type { PaymentProvider } from "@/lib/plans";

const PLAN_DETAILS = [
  {
    id: "FREE",
    name: "Free Plan",
    price: "$0",
    period: "/ month",
    badge: "3 Free Trial Builds",
    desc: "Build and run your app in Live Preview. Code is locked.",
    features: [
      "3 Free Trial Builds (one-time)",
      "Live Preview of your app",
      "Locked: code view, copy, edit & export",
    ],
  },
  {
    id: "STANDARD",
    name: "Standard Plan",
    price: "$9",
    period: "/ month",
    badge: "10 Tokens Included",
    tag: "Best Value",
    desc: "Unlocks all 5 AI agents, full code access & ZIP Export.",
    features: [
      "10 Monthly Generation Tokens",
      "All 5 Full-Stack Agents Unlocked",
      "Full code access & ZIP Export",
      "$1 Extra Token Top-Ups Anytime",
    ],
  },
  {
    id: "PRO",
    name: "Pro Plan",
    price: "$49",
    period: "/ month",
    badge: "50 Tokens Included",
    tag: "Popular",
    desc: "High-volume token allowance for power builders.",
    features: [
      "50 Monthly Generation Tokens",
      "All 5 Full-Stack Agents Unlocked",
      "Unlimited History & Priority Build",
      "$1 Extra Token Top Ups Anytime",
    ],
  },
  {
    id: "EXCLUSIVE",
    name: "Exclusive Plan",
    price: "Custom",
    period: "Monthly Billing",
    badge: "250+ Custom Tokens",
    desc: "Custom agent customization & dedicated monthly billing.",
    features: [
      "250+ Custom Monthly Token Volume",
      "Custom Agent System Rules & Prompts",
      "Consolidated Monthly Billing",
      "On Demand $1 Extra Token Top-Ups",
    ],
  },
];

export default function PricingPage() {
  const [extraTokensCount, setExtraTokensCount] = useState<number>(5);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [provider, setProvider] = useState<PaymentProvider>("razorpay");

  const handleSelectPlan = async (planId: string) => {
    if (planId === "FREE") {
      window.location.href = "/orchestrate";
      return;
    }
    if (planId === "EXCLUSIVE") {
      contactForExclusive();
      return;
    }
    setLoadingPlan(planId);
    const result = await startCheckout({ action: "PLAN", plan: planId }, provider);
    if (result.kind === "demo" || result.kind === "switched") {
      window.location.href = "/orchestrate?checkout=success";
      return;
    }
    if (result.kind === "error") alert(result.error);
    if (result.kind !== "redirect") setLoadingPlan(null);
  };

  const handleBuyTokens = async (count: number) => {
    setLoadingPlan("TOPUP");
    const result = await startCheckout({ action: "TOKENS", tokens: count }, provider);
    if (result.kind === "demo") {
      alert(`Successfully added ${count} extra tokens!`);
    } else if (result.kind === "error") {
      alert(result.error);
    }
    if (result.kind !== "redirect") setLoadingPlan(null);
  };

  return (
    <main className="min-h-screen bg-[#070A12] text-white p-6 md:p-12 flex flex-col items-center justify-center font-sans">
      <div className="bg-[#0E1424] border border-slate-800 rounded-3xl max-w-6xl w-full p-6 md:p-8 shadow-2xl relative">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-6 mb-8 border-b border-slate-800">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5" /> BUILD CORE PLANS & TOKEN BILLING
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-1">
              Unlock All 5 AI Agents or Top Up Extra Tokens ($1)
            </h1>
          </div>
          <Link
            href="/workspace"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </Link>
        </div>

        <PaymentMethodToggle value={provider} onChange={setProvider} />

        {/* 4 Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {PLAN_DETAILS.map((plan) => {
            const isStandard = plan.id === "STANDARD";
            const isPro = plan.id === "PRO";

            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-5 flex flex-col justify-between border transition ${
                  isPro
                    ? "bg-gradient-to-b from-violet-950/40 to-slate-900/90 border-violet-500 shadow-xl shadow-violet-500/10"
                    : isStandard
                    ? "bg-slate-900/90 border-amber-500/60 shadow-xl shadow-amber-500/5"
                    : "bg-slate-900/50 border-slate-800"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-base text-white">{plan.name}</h3>
                    {plan.tag && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {plan.tag}
                      </span>
                    )}
                  </div>

                  <div className="my-3">
                    <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-xs text-slate-400 ml-1">{plan.period}</span>
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
                  disabled={loadingPlan === plan.id}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shadow-lg ${
                    plan.id === "FREE"
                      ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      : isStandard
                      ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:brightness-110 shadow-amber-500/20"
                      : isPro
                      ? "bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 shadow-violet-600/25"
                      : "bg-slate-800 text-white hover:bg-slate-700 border border-slate-700"
                  }`}
                >
                  {loadingPlan === plan.id ? "Processing..." : `Select ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Extra Token Top-Up Bar */}
        <div className="rounded-2xl bg-[#090D16] border border-amber-500/40 p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div>
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Coins className="w-4 h-4" />
              <span>Need More Tokens This Month? Buy Extra Tokens for $1 Each</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Finished your monthly plan tokens early? Top up extra tokens instantly at <strong className="text-slate-200">$1 per token</strong> without changing your subscription.
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
                  setExtraTokensCount(
                    Math.min(500, Math.max(1, Math.floor(Number(e.target.value)) || 1))
                  )
                }
                className="w-12 bg-transparent text-center font-bold text-sm text-white focus:outline-none"
              />
              <span className="text-xs text-slate-400 ml-1">Tokens</span>
            </div>

            <button
              onClick={() => handleBuyTokens(extraTokensCount)}
              disabled={loadingPlan === "TOPUP"}
              className="px-5 py-2.5 rounded-xl font-extrabold text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-110 flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {loadingPlan === "TOPUP" ? "Adding..." : `Buy for $${extraTokensCount * 1}`}
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}