import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link"; // Import Link for client-side routing

export default async function WorkspacePage() {
  const session = await auth();

  // If NOT logged in, send them back to the landing page
  if (!session?.user) {
    redirect("/");
  }

  // If logged in, show the workspace!
  return (
    <div className="min-h-screen bg-neutral-950 text-white p-10 flex flex-col items-center justify-center">
      <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
        
        {/* Conditionally render the image or a fallback initial */}
        {session.user.image ? (
          <img 
            src={session.user.image} 
            alt="Profile" 
            className="w-24 h-24 rounded-full mx-auto mb-6 border-4 border-indigo-500 object-cover"
          />
        ) : (
          <div className="w-24 h-24 rounded-full mx-auto mb-6 border-4 border-indigo-500 bg-neutral-800 flex items-center justify-center text-4xl font-bold text-indigo-400">
            {session.user.name?.charAt(0) || "?"}
          </div>
        )}
        
        <h1 className="text-3xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
          Welcome back!
        </h1>
        <p className="text-xl font-semibold mb-1">{session.user.name}</p>
        <p className="text-neutral-400 mb-8">{session.user.email}</p>
        
        {/* LAUNCH EDITOR BUTTON - Routes to Pricing & Plans first */}
        <Link href="/pricing">
          <button className="w-full flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 py-4 text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Launch Build_Core Editor
          </button>
        </Link>

        <div className="mt-8 p-4 bg-black rounded-lg text-left overflow-hidden">
          <p className="text-xs text-neutral-500 mb-2">DATABASE SESSION ID:</p>
          <p className="text-sm font-mono text-indigo-300 truncate">
            {session.user.id}
          </p>
        </div>
      </div>
    </div>
  );
}