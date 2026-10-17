import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import SplineBackground from "@/components/SplineBackground";

export default async function LandingPage() {
  const session = await auth();

  // Redirect authenticated users to their workspace.
  if (session?.user) {
    redirect("/workspace");
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#050608]">
      {/* Full-screen animated 3D background */}
      <SplineBackground />

      {/* Background atmosphere and cinematic lighting */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_10%,rgba(0,0,0,0.45)_100%)]" />

      {/* Foreground content */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-12 text-center">
        {/* Brand */}
        <div className="mb-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium tracking-[0.2em] text-neutral-300 backdrop-blur-md">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]" />
            AI SOFTWARE ENGINEERING
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl md:text-7xl lg:text-8xl">
            Welcome to
            <span className="mt-2 block bg-gradient-to-r from-indigo-400 via-blue-400 to-cyan-300 bg-clip-text text-transparent">
              Build_Core
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-neutral-300 sm:text-lg md:text-xl">
            The autonomous multi-agent software engineering platform.
            <span className="mt-1 block text-neutral-400">
              Go from idea to live deployment.
            </span>
          </p>
        </div>

        {/* Authentication card */}
        <div className="w-full max-w-md rounded-3xl border border-white/[0.12] bg-[#101115]/80 p-6 shadow-[0_0_80px_rgba(37,99,235,0.10)] backdrop-blur-2xl sm:p-9">
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Get Started
          </h2>

          <p className="mt-2 mb-7 text-sm text-neutral-400">
            Sign in to start building your next project.
          </p>

          <form
            action={async () => {
              "use server";
              await signIn("google", {
                redirectTo: "/workspace",
              });
            }}
          >
            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-3 rounded-xl bg-white px-5 py-4 text-sm font-bold text-black shadow-lg transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-100 hover:shadow-[0_8px_35px_rgba(59,130,246,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
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
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>

              Continue with Google
              <span className="ml-auto text-neutral-400 transition-transform group-hover:translate-x-1">
                →
              </span>
            </button>
          </form>

          <div className="my-7 flex items-center gap-4">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-medium tracking-[0.2em] text-neutral-500">
              OR CONTINUE WITH EMAIL
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-4 text-sm font-medium text-neutral-500"
          >
            Email Login · Coming Soon
          </button>

          <p className="mt-6 text-xs leading-5 text-neutral-500">
            By continuing, you agree to use Build_Core responsibly.
          </p>
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs tracking-wide text-neutral-500">
          BUILD INTELLIGENTLY. SHIP CONFIDENTLY.
        </p>
      </section>
    </main>
  );
}