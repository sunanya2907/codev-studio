import "server-only"; // build fails if a client component ever imports this file
// AI helper. Every AI call in the app goes through generateText().
// Gemini is the only provider (set GEMINI_API_KEY). Plain REST call: no extra npm packages.
// Provider fail-over was removed on purpose; it can be added back later.

export type ProviderId = "gemini";

const DEFAULT_MODEL = "gemini-3.8-flash";
const DEFAULT_MAX_TOKENS = 32768;

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI service is not configured. Set GEMINI_API_KEY.");
  }
}

export class AiUnavailableError extends Error {
  constructor(public attempts: AiAttempt[]) {
    const reason = attempts.map((a) => a.error).filter(Boolean).join("; ");
    // In development the real Gemini reason is appended so it is visible in the popup too.
    super(
      "The AI service is temporarily unavailable. Please try again in a minute." +
        (process.env.NODE_ENV !== "production" && reason ? ` [Dev: ${reason}]` : "")
    );
    // Real reason (e.g. "HTTP 429: quota exceeded") for logs / the debug agent.
    this.reason = reason;
  }
  reason: string;
}

export type AiAttempt = { provider: ProviderId; ok: boolean; error?: string; ms: number };
export type AiResult = { text: string; provider: ProviderId; model: string; attempts: AiAttempt[] };

const envOf = (name: string) => process.env[name]?.trim() || "";

export const aiConfigured = () => !!envOf("GEMINI_API_KEY");

export type GenerateOptions = {
  /** Absolute time (ms since epoch) after which no new attempt is started. */
  deadline?: number;
  /** Max time for the request. Default 240s (AI_ATTEMPT_TIMEOUT_MS). */
  attemptTimeoutMs?: number;
  /** Cap on the answer length (default 32768). Small jobs such as a review can use less. */
  maxOutputTokens?: number;
};

const RETRIES = 2; // extra tries on temporary Gemini errors (overload / rate limit / timeout)

export const modelChain = () => {
  const primary = envOf("GEMINI_MODEL") || DEFAULT_MODEL;
  const extra = (envOf("GEMINI_FALLBACK_MODELS") || "gemini-3.7-flash,gemini-3.5-flash")
    .split(",").map((m) => m.trim()).filter(Boolean);
  return [primary, ...extra.filter((m) => m !== primary)];
};

export async function generateText(prompt: string, opts: GenerateOptions = {}): Promise<AiResult> {
  const all: AiAttempt[] = [];
  const models = modelChain();
  for (let i = 0; ; i++) {
    // Retry 1 and 2 switch to the next model, so an overloaded / missing / quota-limited model does not kill the build.
    const model = models[Math.min(i, models.length - 1)];
    try {
      const r = await generateOnce(prompt, opts, all, model);
      return { ...r, attempts: all };
    } catch (err) {
      const last = err instanceof AiUnavailableError ? err : null;
      const retryable = last && /HTTP (400|404|429|500|502|503|504)|overloaded|Empty response|fetch failed|Timed out|not found|max_output_tokens|maxOutputTokens/i.test(last.reason);
      const timeLeft = opts.deadline ? opts.deadline - Date.now() : Infinity;
      if (!retryable || i >= RETRIES || timeLeft < 15_000) {
        if (last) throw new AiUnavailableError(all);
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

async function generateOnce(prompt: string, opts: GenerateOptions, all: AiAttempt[], model: string): Promise<AiResult> {
  const key = envOf("GEMINI_API_KEY");
  if (!key) throw new AiNotConfiguredError();

  const maxTokens = opts.maxOutputTokens || Number(envOf("GEMINI_MAX_OUTPUT_TOKENS")) || DEFAULT_MAX_TOKENS;
  const attemptCap =
    opts.attemptTimeoutMs ?? (Number(envOf("AI_ATTEMPT_TIMEOUT_MS")) || 240_000);
  // If Gemini sends NOTHING for this long the call is treated as stuck, dropped, and retried on the next model.
  // (Before this, one stuck call could use the whole 300 second limit and the build failed.)
  const stallMs = Number(envOf("AI_STALL_MS")) || 75_000;
  const baseUrl = envOf("GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com";
  // Optional: limit "thinking" (a big part of the wait on thinking-capable models). Example: GEMINI_THINKING_BUDGET=0
  const thinking = envOf("GEMINI_THINKING_BUDGET");

  const remaining = opts.deadline ? opts.deadline - Date.now() : Infinity;
  const started = Date.now();
  const fail = (error: string): never => {
    const a: AiAttempt = { provider: "gemini", ok: false, error: `[${model}] ${error}`, ms: Date.now() - started };
    all.push(a);
    console.error("GEMINI REQUEST FAILED:", JSON.stringify(a));
    throw new AiUnavailableError([a]);
  };
  if (remaining < 3_000) return fail("Not enough time left");

  const controller = new AbortController();
  let abortWhy = "";
  const totalTimer = setTimeout(() => {
    abortWhy = `no answer within ${Math.round(Math.min(attemptCap, remaining) / 1000)}s`;
    controller.abort();
  }, Math.min(attemptCap, remaining));
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      abortWhy = `no data for ${Math.round(stallMs / 1000)}s`;
      controller.abort();
    }, stallMs);
  };

  try {
    armStall();
    const generationConfig: Record<string, unknown> = { maxOutputTokens: maxTokens };
    if (thinking !== "" && Number.isFinite(Number(thinking))) generationConfig.thinkingConfig = { thinkingBudget: Number(thinking) };

    const res = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const data: any = await res.json().catch(() => ({}));
      return fail(`HTTP ${res.status}: ${String(data?.error?.message || "").slice(0, 280)}`);
    }

    // Read the answer as it streams in (Server-Sent Events: lines starting with "data: ").
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let finishReason = "";
    let blockReason = "";
    let firstChunkMs = 0;
    const handleEvent = (raw: string) => {
      const line = raw.split(/\r?\n/).find((l) => l.startsWith("data:"));
      if (!line) return;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") return;
      let data: any;
      try {
        data = JSON.parse(json);
      } catch {
        return; // a half-received event: ignore
      }
      if (data?.error) fail(`HTTP ${data.error.code || 500}: ${String(data.error.message || "").slice(0, 280)}`);
      if (data?.promptFeedback?.blockReason) blockReason = String(data.promptFeedback.blockReason);
      const cand = data?.candidates?.[0];
      if (cand?.finishReason) finishReason = String(cand.finishReason);
      for (const p of cand?.content?.parts ?? []) if (typeof p?.text === "string" && !p?.thought) text += p.text;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armStall(); // data arrived: the call is alive
      if (!firstChunkMs) firstChunkMs = Date.now() - started;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
        handleEvent(buf.slice(0, idx));
        buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
      }
    }
    if (buf.trim()) handleEvent(buf);

    if (blockReason && !text.trim()) return fail(`Blocked: ${blockReason}`);
    text = text.trim();
    if (!text) return fail("Empty response");
    if (finishReason === "MAX_TOKENS") {
      console.warn("Gemini answer was cut off (token limit); returning the partial answer.");
    }
    const ms = Date.now() - started;
    all.push({ provider: "gemini", ok: true, ms });
    // Timing line for the Vercel logs: how long Gemini took to start and to finish.
    console.log("GEMINI OK", JSON.stringify({ model, firstTokenMs: firstChunkMs, totalMs: ms, chars: text.length, finishReason }));
    return { text, provider: "gemini", model, attempts: all };
  } catch (err: any) {
    if (err instanceof AiUnavailableError) throw err;
    if (err?.name === "AbortError") return fail(`Timed out (${abortWhy || "aborted"})`);
    return fail(String(err?.message || err).slice(0, 300));
  } finally {
    clearTimeout(totalTimer);
    if (stallTimer) clearTimeout(stallTimer);
  }
}