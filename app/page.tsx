import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import GoogleLoginButton from "@/components/GoogleLoginButton";

export default async function LandingPage() {
  const session = await auth();

  // If already logged in, send them straight to their workspace dashboard
  if (session?.user) {
    redirect("/workspace");
  }

  async function handleGoogleSignIn() {
    "use server";
    await signIn("google", { redirectTo: "/workspace" });
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
          The autonomous multi-agent software engineering platform.
          <br />
          Go from idea to live deployment.
        </p>

        {/* Login Card Box */}
        <div className="bg-neutral-900/80 backdrop-blur border border-neutral-800 p-8 rounded-2xl max-w-md mx-auto shadow-2xl">
          <h2 className="text-xl font-bold mb-1">Get Started</h2>
          <p className="text-xs text-neutral-400 mb-6">
            Sign in to start building your next project.
          </p>

          <GoogleLoginButton signInAction={handleGoogleSignIn} />

          <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-neutral-800" />
            <span className="flex-shrink mx-4 text-neutral-600 text-[10px] uppercase tracking-wider">
              Or continue with email
            </span>
            <div className="flex-grow border-t border-neutral-800" />
          </div>

          <button
            disabled
            className="w-full bg-neutral-950 border border-neutral-800 text-neutral-600 py-3 rounded-xl text-xs font-medium cursor-not-allowed"
          >
            Email Login · Coming Soon
          </button>

          <p className="text-[11px] text-neutral-500 mt-6">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="text-neutral-400 underline hover:text-white">
              Terms & Conditions
            </Link>{" "}
            and data training policy.
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