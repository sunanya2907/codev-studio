"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function TermsConsentPage() {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAccept = async () => {
    if (!checked) return;
    setLoading(true);
    try {
      const res = await fetch("/api/terms", { method: "POST" });
      if (res.ok) {
        router.push("/orchestrate");
        router.refresh();
      } else {
        alert("Failed to save terms acceptance.");
      }
    } catch (e) {
      alert("Error saving terms acceptance.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070A12] text-white flex items-center justify-center p-4">
      <div className="bg-[#0E1424] border border-slate-800 rounded-3xl max-w-lg w-full p-8 shadow-2xl">
        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
          <ShieldCheck className="w-4 h-4" /> Legal & Data Usage Consent
        </span>
        <h1 className="text-2xl font-extrabold mb-3">Terms & Conditions Required</h1>
        <p className="text-xs text-slate-300 leading-relaxed mb-6">
          Welcome to <strong>Build_Core</strong>. Before entering the multi-agent studio, you must review and accept our Terms and Conditions, including our AI agent training policy.
        </p>

        <div className="bg-[#090D16] border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-2 max-h-48 overflow-y-auto mb-6">
          <p>
            • <strong>AI Agent Training License:</strong> By submitting prompts, specifications, or code inputs, you grant Build_Core a worldwide, royalty-free license to store, analyze, and use your prompts and generated outputs to train, fine-tune, and improve our AI agents and platform models.
          </p>
          <p>
            • <strong>Code Ownership:</strong> You retain full ownership and commercial rights to the code and ZIP exports generated from your prompts.
          </p>
          <p>
            • <strong>Confidentiality Caution:</strong> Do not enter production secret keys, passwords, or sensitive personal data into prompts.
          </p>
        </div>

        <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none mb-6">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 cursor-pointer accent-amber-400"
          />
          <span>
            I have read and agree to the{" "}
            <Link href="/terms" target="_blank" className="text-amber-400 underline font-semibold">
              Terms & Conditions
            </Link>{" "}
            and AI agent training data usage policy.
          </span>
        </label>

        <button
          onClick={handleAccept}
          disabled={!checked || loading}
          className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
            checked && !loading
              ? "bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white hover:brightness-110 shadow-lg shadow-violet-600/25 cursor-pointer"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          {loading ? "Saving..." : "Accept & Enter Studio"}
        </button>
      </div>
    </main>
  );
}