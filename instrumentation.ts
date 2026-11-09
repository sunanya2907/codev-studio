// Next.js calls register() once when the server starts and onRequestError() for every
// unhandled error in a route handler, page or server action. That is how the Debug Agent
// sees server errors without any try/catch changes in your existing code.

type RequestInfo = { path: string; method: string };

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDebugLoop } = await import("@/lib/debug-agent");
    startDebugLoop();
  }
}

export async function onRequestError(err: unknown, request: RequestInfo) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (request.path.startsWith("/api/debug")) return; // never report the agent's own routes
  const { reportError } = await import("@/lib/debug-agent");
  await reportError(err, { source: "server", route: request.path.split("?")[0], method: request.method });
}
