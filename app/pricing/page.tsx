"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const router = useRouter();
  const [proStatus, setProStatus] = useState(false);

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-bold uppercase tracking-wider">
            Build_Core Subscription Tiers
          </span>
          <h1 className="text-4xl font-extrabold mt-3 tracking-tight">Choose Your Deployment Power</h1>
          <p className="text-neutral-400 text-sm mt-2">
            Select a plan to configure your multi-agent architecture and cloud infrastructure.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* Free Tier */}
          <div className="border border-neutral-800 rounded-2xl p-8 bg-neutral-900/50 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-lg text-neutral-200">Free Explorer</h3>
              <div className="text-3xl font-black mt-3">$0 <span className="text-sm font-normal text-neutral-500">/mo</span></div>
              <ul className="text-xs text-neutral-400 mt-6 space-y-3">
                <li>✓ 3 app generations per month</li>
                <li>✓ Standard .zip project exports</li>
                <li>✓ Live interactive preview</li>
                <li>✗ Advanced Agent 5 Cloud Deploy    </li>
              </ul>
            </div>
            <button
              onClick={() => router.push("/orchestrate")}
              className="mt-8 w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-sm rounded-xl font-bold transition-colors"
            >
              Continue with Free
            </button>
          </div>

          {/* Pro Tier (Coming Soon) */}
          <div className="border-2 border-yellow-500/80 rounded-2xl p-8 bg-gradient-to-b from-yellow-950/20 to-neutral-900/50 flex flex-col justify-between relative shadow-xl shadow-yellow-500/10">
            <div className="absolute -top-3 right-6 bg-yellow-500 text-black text-[10px] font-black uppercase px-3 py-1 rounded-full">
              Recommended
            </div>
            <div>
              <h3 className="font-bold text-lg text-yellow-400">Pro Builder</h3>
              <div className="text-3xl font-black mt-3">$29 <span className="text-sm font-normal text-neutral-400">/mo</span></div>
              <ul className="text-xs text-neutral-300 mt-6 space-y-3">
                <li>✓ <strong>Unlimited</strong> app generations</li>
                <li>✓ Direct GitHub & Vercel deployment</li>
                <li>✓ AI Domain Suggestion & Registry</li>
                <li>✓ Priority multi-agent execution</li>
              </ul>
            </div>
            <button
              onClick={() => setProStatus(true)}
              disabled={proStatus}
              className="mt-8 w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-black text-sm rounded-xl font-extrabold transition-all shadow cursor-pointer disabled:cursor-not-allowed"
            >
              {proStatus ? "Coming Soon..." : "Upgrade to Pro ($29/mo)"}
            </button>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={() => router.push("/workspace")}
            className="text-xs text-neutral-500 hover:text-neutral-300 underline"
          >
            ← Back to Workspace Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}