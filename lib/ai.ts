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
    super("The AI service is temporarily unavailable. Please try again in a minute.");
  }
}

export type AiAttempt = { provider: ProviderId; ok: boolean; error?: string; ms: number };
export type AiResult = { text: string; provider: ProviderId; model: string; attempts: AiAttempt[] };

const envOf = (name: string) => process.env[name]?.trim() || "";

export const aiConfigured = () => !!envOf("GEMINI_API_KEY");

export type GenerateOptions = {
  /** Absolute time (ms since epoch) after which no new attempt is started. */
  deadline?: number;
  /** Max time for the request. Default 100s (AI_ATTEMPT_TIMEOUT_MS). */
  attemptTimeoutMs?: number;
};

export async function generateText(prompt: string, opts: GenerateOptions = {}): Promise<AiResult> {
  const key = envOf("GEMINI_API_KEY");
  if (!key) throw new AiNotConfiguredError();

  const model = envOf("GEMINI_MODEL") || DEFAULT_MODEL;
  const maxTokens = Number(envOf("GEMINI_MAX_OUTPUT_TOKENS")) || DEFAULT_MAX_TOKENS;
  const attemptCap =
    opts.attemptTimeoutMs ?? (Number(envOf("AI_ATTEMPT_TIMEOUT_MS")) || 100_000);

  const remaining = opts.deadline ? opts.deadline - Date.now() : Infinity;
  const started = Date.now();
  const fail = (error: string): never => {
    const attempts: AiAttempt[] = [{ provider: "gemini", ok: false, error, ms: Date.now() - started }];
    console.error("GEMINI REQUEST FAILED:", JSON.stringify(attempts));
    throw new AiUnavailableError(attempts);
  };
  if (remaining < 3_000) return fail("Not enough time left");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(attemptCap, remaining));

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        signal: controller.signal,
      }
    );
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return fail(String(data?.error?.message || `HTTP ${res.status}`).slice(0, 300));
    }
    if (data?.promptFeedback?.blockReason) {
      return fail(`Blocked: ${data.promptFeedback.blockReason}`);
    }
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((x: any) => x?.text ?? "").join("").trim();
    if (!text) return fail("Empty response");
    if (cand?.finishReason === "MAX_TOKENS") {
      console.warn("Gemini answer was cut off (token limit); returning the partial answer.");
    }
    const attempts: AiAttempt[] = [{ provider: "gemini", ok: true, ms: Date.now() - started }];
    return { text, provider: "gemini", model, attempts };
  } catch (err: any) {
    if (err instanceof AiUnavailableError) throw err;
    return fail(err?.name === "AbortError" ? "Timed out" : String(err?.message || err).slice(0, 300));
  } finally {
    clearTimeout(timer);
  }
}
