"use client";

import React from "react";
import {
  PLAN_PRICE_CENTS,
  PLAN_PRICE_PAISE,
  TOKEN_PRICE_CENTS,
  TOKEN_PRICE_PAISE,
  inr,
  usd,
  type PaymentProvider,
} from "@/lib/plans";

const OPTIONS: { id: PaymentProvider; title: string; sub: string }[] = [
  {
    id: "razorpay",
    title: "India: UPI / Cards / Wallets",
    sub: `GPay, PhonePe, Paytm, FamPay, any UPI app, debit & credit cards. Pay in ₹ (Standard ${inr(PLAN_PRICE_PAISE.STANDARD)}, Pro ${inr(PLAN_PRICE_PAISE.PRO)}, token ${inr(TOKEN_PRICE_PAISE)}). 30 days per payment.`,
  },
  {
    id: "stripe",
    title: "International: Card",
    sub: `Visa / Mastercard / Amex in USD (${usd(PLAN_PRICE_CENTS.STANDARD)} / ${usd(PLAN_PRICE_CENTS.PRO)}, ${usd(TOKEN_PRICE_CENTS)} per token). Renews automatically every month.`,
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
