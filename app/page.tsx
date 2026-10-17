import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-2xl w-full">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono tracking-widest uppercase text-neutral-400">Multi-Agent AI Platform</span>
        </div>

        <h1 className="text-5xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-200 to-neutral-400">
          Build_Core
        </h1>
        
        <p className="text-neutral-400 text-base mb-8 max-w-lg mx-auto">
          The ultimate multi-agent software generation SaaS. Architect, build, and deploy full-stack applications instantly.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/workspace"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20"
          >
            Get Started / Sign In
          </Link>
          <Link
            href="/pricing"
            className="px-8 py-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-sm font-bold rounded-xl transition-all"
          >
            View Pricing
          </Link>
        </div>
      </div>
    </main>
  );
}