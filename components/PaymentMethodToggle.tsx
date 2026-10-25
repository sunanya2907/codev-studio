"use client";

import React from "react";
import type { PaymentProvider } from "@/lib/plans";

const OPTIONS: { id: PaymentProvider; title: string; sub: string }[] = [
  {
    id: "razorpay",
    title: "India: UPI / Cards / Wallets",
    sub: "GPay, PhonePe, Paytm, FamPay, any UPI app, debit & credit cards. Pay in ₹ (Standard ₹799, Pro ₹3,999, token ₹99). 30 days per payment.",
  },
  {
    id: "stripe",
    title: "International: Card",
    sub: "Visa / Mastercard / Amex in USD ($9 / $49, $1 per token). Renews automatically every month.",
  },
];

export default function PaymentMethodToggle({
  value,
  onChange,
}: {
  value: PaymentProvider;
  onChange: (v: PaymentProvider) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`text-left rounded-xl border p-3 transition ${
            value === o.id
              ? "border-amber-400 bg-amber-500/10"
              : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
          }`}
        >
          <div className="text-xs font-bold text-white">{o.title}</div>
          <div className="text-[11px] text-slate-400 mt-1 leading-snug">{o.sub}</div>
        </button>
      ))}
    </div>
  );
}
