// Browser side of the Debug Agent: sends uncaught errors to /api/debug/report.
// Capped per page load so a render loop can't flood the server.
let sent = 0;
const seen = new Set<string>();

export function reportClientError(err: unknown, where?: string) {
  try {
    if (typeof window === "undefined" || sent >= 5) return;
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown client error");
    const key = `${e.message}|${(e.stack || "").slice(0, 120)}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent++;
    void fetch("/api/debug/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message: e.message,
        stack: e.stack,
        route: where || window.location.pathname,
      }),
    }).catch(() => {});
  } catch {
    /* reporting must never throw */
  }
}
