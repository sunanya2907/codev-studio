"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/debug-client";

// Last-resort boundary (errors in the root layout). Must render its own <html> and <body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return (
    <html lang="en">
      <body style={{ background: "#0a0a0a", color: "#fff", fontFamily: "sans-serif", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h2>Something went wrong</h2>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
