// app/workspace/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function WorkspacePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-8">
      <div className="bg-neutral-900/80 backdrop-blur border border-neutral-800 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center">
        <div className="w-20 h-20 rounded-full bg-neutral-800 border-2 border-neutral-700 flex items-center justify-center text-2xl font-bold mx-auto mb-4 text-white">
          {session.user.name ? session.user.name.charAt(0).toUpperCase() : "S"}
        </div>

        <h1 className="text-2xl font-bold mb-1">Welcome back!</h1>
        <p className="text-sm font-semibold text-white mb-1">{session.user.name}</p>
        <p className="text-xs text-neutral-400 mb-8">{session.user.email}</p>

        <Link
          href="/orchestrate"
          className="w-full inline-flex items-center justify-center bg-gradient-to-r from-violet-600 to-cyan-500 hover:brightness-110 text-white font-semibold py-3.5 px-6 rounded-xl text-sm transition shadow-lg shadow-violet-600/25"
        >
          Launch Build_Core Editor →
        </Link>
      </div>
    </main>
  );
}