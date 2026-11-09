"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/debug-client";

// Catches render errors inside a page and reports them to the Debug Agent.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-neutral-400">The problem was reported automatically. You can try again.</p>
      <button onClick={reset} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">
        Try again
      </button>
    </div>
  );
}
