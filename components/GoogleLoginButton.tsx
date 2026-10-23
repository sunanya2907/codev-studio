"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function GoogleLoginButton({
  signInAction,
}: {
  signInAction: () => Promise<void>;
}) {
  const [accepted, setAccepted] = useState(false);

  return (
    <form action={signInAction} className="w-full space-y-4 text-left">
      <label className="flex items-start gap-2.5 text-xs text-neutral-400 cursor-pointer select-none bg-neutral-950/60 border border-neutral-800 p-3 rounded-xl hover:border-neutral-700 transition">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer accent-cyan-400"
        />
        <span className="leading-relaxed">
          I agree to the{" "}
          <Link
            href="/terms"
            target="_blank"
            className="text-cyan-400 underline hover:text-cyan-300 font-medium"
          >
            Terms & Conditions
          </Link>{" "}
          (including AI agent training data usage) and Privacy Policy.
        </span>
      </label>

      <button
        type="submit"
        disabled={!accepted}
        className={`w-full flex items-center justify-center gap-3 font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow ${
          accepted
            ? "bg-white hover:bg-neutral-100 text-neutral-900 cursor-pointer"
            : "bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-60"
        }`}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path
            fill={accepted ? "#4285F4" : "currentColor"}
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill={accepted ? "#34A853" : "currentColor"}
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill={accepted ? "#FBBC05" : "currentColor"}
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill={accepted ? "#EA4335" : "currentColor"}
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        Continue with Google
      </button>
    </form>
  );
}