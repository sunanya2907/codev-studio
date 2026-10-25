// AI provider router with automatic fail-over.
//
// Every AI call in the app goes through generateText(). It tries the providers in
// AI_PROVIDER_ORDER (default: gemini, anthropic, openai, deepseek) and moves on to the
// next one when a provider is down, rate-limited, out of credit, times out, rejects the
// request, returns nothing, or cuts its answer off. Only providers that have an API key
// are used. Plain REST calls: no extra npm packages.

export type ProviderId = "gemini" | "anthropic" | "openai" | "deepseek";

type ProviderDef = {
  id: ProviderId;
  label: string;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  maxTokensEnv: string;
  defaultMaxTokens: number;
};

const PROVIDERS: Record<ProviderId, ProviderDef> = {
  gemini: {
    id: "gemini",
    label: "Gemini",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-3.8-flash",
    maxTokensEnv: "GEMINI_MAX_OUTPUT_TOKENS",
    defaultMaxTokens: 32768,
  },
  anthropic: {
    id: "anthropic",
    label: "Claude",
    keyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-5-5",
    maxTokensEnv: "ANTHROPIC_MAX_TOKENS",
    defaultMaxTokens: 16000,
  },
  openai: {
    id: "openai",
    label: "GPT",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-5-mini",
    maxTokensEnv: "OPENAI_MAX_TOKENS",
    defaultMaxTokens: 16000,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-chat",
    maxTokensEnv: "DEEPSEEK_MAX_TOKENS",
    defaultMaxTokens: 8192, // deepseek-chat's output cap
  },
};

const DEFAULT_ORDER: ProviderId[] = ["gemini", "anthropic", "openai", "deepseek"];

/** After a provider fails it is skipped for this long (while others are available). */
const COOLDOWN_MS = 60_000;
const cooldownUntil: Partial<Record<ProviderId, number>> = {};

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "No AI provider is configured. Set at least one of GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY or DEEPSEEK_API_KEY."
    );
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

/** Providers that have a key, in the configured order. */
export function configuredProviders(): ProviderDef[] {
  const order = envOf("AI_PROVIDER_ORDER")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ProviderId => s in PROVIDERS);
  const list = order.length ? order : DEFAULT_ORDER;
  // Any provider with a key that the order list forgot still goes at the end.
  const all = [...new Set([...list, ...DEFAULT_ORDER])];
  return all.map((id) => PROVIDERS[id]).filter((p) => !!envOf(p.keyEnv));
}

export const aiConfigured = () => configuredProviders().length > 0;

export function resetAiState() {
  for (const k of Object.keys(cooldownUntil)) delete cooldownUntil[k as ProviderId];
}

// ---- one HTTP call per provider --------------------------------------------------------

type Raw = { text: string; truncated: boolean };

class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal
): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message || data?.error?.description || data?.message || `HTTP ${res.status}`;
    throw new HttpError(String(msg).slice(0, 300), res.status);
  }
  return data;
}

async function callProvider(
  p: ProviderDef,
  model: string,
  maxTokens: number,
  prompt: string,
  signal: AbortSignal
): Promise<Raw> {
  const key = envOf(p.keyEnv);

  if (p.id === "gemini") {
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": key },
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      },
      signal
    );
    if (data?.promptFeedback?.blockReason) {
      throw new Error(`Blocked: ${data.promptFeedback.blockReason}`);
    }
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((x: any) => x?.text ?? "").join("");
    return { text, truncated: cand?.finishReason === "MAX_TOKENS" };
  }

  if (p.id === "anthropic") {
    const data = await postJson(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": key, "anthropic-version": "2023-06-01" },
      { model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] },
      signal
    );
    const text = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("");
    return { text, truncated: data?.stop_reason === "max_tokens" };
  }

  // OpenAI and DeepSeek share the chat-completions format.
  const isOpenAI = p.id === "openai";
  const data = await postJson(
    isOpenAI
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.deepseek.com/chat/completions",
    { Authorization: `Bearer ${key}` },
    {
      model,
      messages: [{ role: "user", content: prompt }],
      // Newer OpenAI models reject max_tokens and require max_completion_tokens.
      ...(isOpenAI ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    },
    signal
  );
  const choice = data?.choices?.[0];
  return { text: choice?.message?.content ?? "", truncated: choice?.finish_reason === "length" };
}

// ---- public API -------------------------------------------------------------------------

export type GenerateOptions = {
  /** Absolute time (ms since epoch) after which no new attempt is started. */
  deadline?: number;
  /** Max time for a single provider attempt. Default 100s (AI_ATTEMPT_TIMEOUT_MS). */
  attemptTimeoutMs?: number;
};

export async function generateText(prompt: string, opts: GenerateOptions = {}): Promise<AiResult> {
  const providers = configuredProviders();
  if (providers.length === 0) throw new AiNotConfiguredError();

  // Providers that failed recently go to the back, so parallel calls don't all wait on
  // a provider we already know is down. If everything is cooling down, still try all.
  const now = Date.now();
  const healthy = providers.filter((p) => (cooldownUntil[p.id] ?? 0) <= now);
  const cooling = providers.filter((p) => (cooldownUntil[p.id] ?? 0) > now);
  const queue = [...healthy, ...cooling];

  const attemptCap =
    opts.attemptTimeoutMs ?? (Number(envOf("AI_ATTEMPT_TIMEOUT_MS")) || 100_000);
  const attempts: AiAttempt[] = [];
  let bestTruncated: AiResult | null = null;

  for (const p of queue) {
    const remaining = opts.deadline ? opts.deadline - Date.now() : Infinity;
    if (remaining < 3_000) break; // not enough time left for a meaningful attempt

    const model = envOf(p.modelEnv) || p.defaultModel;
    const maxTokens = Number(envOf(p.maxTokensEnv)) || p.defaultMaxTokens;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(attemptCap, remaining));

    try {
      const raw = await callProvider(p, model, maxTokens, prompt, controller.signal);
      const text = raw.text.trim();
      if (!text) throw new Error("Empty response");

      if (raw.truncated) {
        // Cut off mid-answer: try the next provider, but remember this as a last resort.
        attempts.push({ provider: p.id, ok: false, error: "Answer was cut off (token limit)", ms: Date.now() - started });
        if (!bestTruncated || text.length > bestTruncated.text.length) {
          bestTruncated = { text, provider: p.id, model, attempts };
        }
        continue;
      }

      attempts.push({ provider: p.id, ok: true, ms: Date.now() - started });
      delete cooldownUntil[p.id];
      return { text, provider: p.id, model, attempts };
    } catch (err: any) {
      const aborted = err?.name === "AbortError";
      const message = aborted ? "Timed out" : String(err?.message || err).slice(0, 300);
      attempts.push({ provider: p.id, ok: false, error: message, ms: Date.now() - started });
      cooldownUntil[p.id] = Date.now() + COOLDOWN_MS;
      console.warn(`AI provider ${p.id} failed (${message}); trying the next one.`);
    } finally {
      clearTimeout(timer);
    }
  }

  if (bestTruncated) {
    console.warn(`All providers failed or were cut off; returning the longest partial answer from ${bestTruncated.provider}.`);
    return { ...bestTruncated, attempts };
  }
  console.error("ALL AI PROVIDERS FAILED:", JSON.stringify(attempts));
  throw new AiUnavailableError(attempts);
}
