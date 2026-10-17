import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();

  // If already logged in, send them straight to their workspace dashboard
  if (session?.user) {
    redirect("/workspace");
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-between p-8 relative overflow-hidden">
      {/* Background Glow Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Top Badge */}
      <div className="z-10 mt-6">
        <span className="px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-cyan-400 text-xs font-mono tracking-widest uppercase shadow">
          ● AI SOFTWARE ENGINEERING
        </span>
      </div>

      {/* Hero Section */}
      <div className="z-10 text-center max-w-3xl my-auto">
        <h1 className="text-6xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-200 to-neutral-400">
          Welcome to Build_Core
        </h1>
        <p className="text-neutral-400 text-base mb-10 max-w-lg mx-auto">
          The autonomous multi-agent software engineering platform.<br />
          Go from idea to live deployment.
        </p>

        {/* Login Card Box */}
        <div className="bg-neutral-900/80 backdrop-blur border border-neutral-800 p-8 rounded-2xl max-w-md mx-auto shadow-2xl">
          <h2 className="text-xl font-bold mb-1">Get Started</h2>
          <p className="text-xs text-neutral-400 mb-6">Sign in to start building your next project.</p>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/workspace" });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-900 font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Continue with Google
            </button>
          </form>

          <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-neutral-800" />
            <span className="flex-shrink mx-4 text-neutral-600 text-[10px] uppercase tracking-wider">Or continue with email</span>
            <div className="flex-grow border-t border-neutral-800" />
          </div>

          <button
            disabled
            className="w-full bg-neutral-950 border border-neutral-800 text-neutral-600 py-3 rounded-xl text-xs font-medium cursor-not-allowed"
          >
            Email Login · Coming Soon
          </button>

          <p className="text-[11px] text-neutral-500 mt-6">
            By continuing, you agree to use Build_Core responsibly.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="z-10 text-neutral-600 text-xs font-mono tracking-widest uppercase">
        BUILD INTELLIGENTLY. SHIP CONFIDENTLY.
      </div>
    </main>
  );
}