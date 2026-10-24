"use client";
import React, { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Mail, Lock } from "lucide-react";

// Auth.js reports failures as short codes. Turn them into something a person can act on.
const AUTH_ERRORS: Record<string, string> = {
  CredentialsSignin:
    "Incorrect email or password. If you signed up with Google, use the Google button instead.",
  password_too_short:
    "New accounts need a password of at least 8 characters.",
  OAuthAccountNotLinked:
    "This email is already registered with a different sign-in method. Please sign in the way you first signed up.",
  AccessDenied: "Access denied.",
  Configuration:
    "Sign-in is temporarily unavailable because of a server configuration problem. Please try again later.",
};

const friendlyError = (code?: string | null) =>
  (code && AUTH_ERRORS[code]) || "Sign-in failed. Please try again.";

export default function LandingPage() {
  const [accepted, setAccepted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google / redirect-based failures come back as /?error=<code>
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(friendlyError(code));
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) return;
    setLoading(true);
    setError(null);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setError(friendlyError(res.code ?? res.error));
      } else {
        window.location.href = "/workspace";
      }
    } catch {
      setError("Authentication failed. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-between p-8 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="z-10 mt-6">
        <span className="px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-cyan-400 text-xs font-mono tracking-widest uppercase shadow">
          ● AI SOFTWARE ENGINEERING
        </span>
      </div>

      <div className="z-10 text-center max-w-3xl my-auto">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-200 to-neutral-400">
          Welcome to Build_Core
        </h1>
        <p className="text-neutral-400 text-base mb-10 max-w-lg mx-auto">
          The autonomous multi-agent software engineering platform.<br />
          Go from idea to live deployment.
        </p>

        {/* Login Card Box */}
        <div className="bg-neutral-900/90 backdrop-blur border border-neutral-800 p-8 rounded-3xl max-w-md mx-auto shadow-2xl">
          <h2 className="text-xl font-bold mb-1">Get Started</h2>
          <p className="text-xs text-neutral-400 mb-6">Create an account or sign in to build your apps.</p>

          {/* Mandatory Terms & Conditions Checkbox Gate */}
          <div className="mb-6 bg-neutral-950/60 border border-neutral-800 p-3 rounded-xl text-left">
            <label className="flex items-start gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-cyan-500 cursor-pointer accent-cyan-400"
              />
              <span className="leading-relaxed">
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-cyan-400 underline font-medium">
                  Terms & Conditions
                </Link>{" "}
                (including AI agent training data usage).
              </span>
            </label>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-left text-xs leading-relaxed text-rose-200"
            >
              {error}
            </div>
          )}

          {/* Google Login Button */}
          <button
            type="button"
            disabled={!accepted}
            onClick={() => signIn("google", { callbackUrl: "/workspace" })}
            className={`w-full flex items-center justify-center gap-3 font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow mb-4 ${
              accepted
                ? "bg-white hover:bg-neutral-100 text-neutral-900 cursor-pointer"
                : "bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-60"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Continue with Google
          </button>

          <div className="relative flex py-3 items-center">
            <div className="flex-grow border-t border-neutral-800" />
            <span className="flex-shrink mx-4 text-neutral-500 text-[10px] uppercase tracking-wider">Or email & password</span>
            <div className="flex-grow border-t border-neutral-800" />
          </div>

          {/* Email & Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3 text-left">
            <div>
              <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-neutral-500" />
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-neutral-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!accepted || loading}
              className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition mt-2 ${
                accepted && !loading
                  ? "bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 cursor-pointer shadow-lg shadow-violet-600/20"
                  : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
              }`}
            >
              {loading ? "Processing..." : "Sign Up / Sign In with Email"}
            </button>
          </form>
        </div>
      </div>

      <div className="z-10 text-neutral-600 text-xs font-mono tracking-widest uppercase">
        BUILD INTELLIGENTLY. SHIP CONFIDENTLY.
      </div>
    </main>
  );
}