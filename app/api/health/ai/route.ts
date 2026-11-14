import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDebugAdmin } from "@/lib/debug-agent";
import { modelChain } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI health check. Open /api/health/ai while signed in as an admin (ADMIN_EMAILS).
 * It sends a tiny request to EVERY model in your chain (GEMINI_MODEL + fallbacks) and shows for each
 * one: does it exist, does the key work, is there quota left, and how fast it answers.
 */
export async function GET() {
  const session = await auth();
  if (!isDebugAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) return NextResponse.json({ ok: false, error: "GEMINI_API_KEY is not set." }, { status: 500 });

  const models = modelChain();
  const results = await Promise.all(
    models.map(async (model) => {
      const t = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
              generationConfig: { maxOutputTokens: 20 },
            }),
            signal: controller.signal,
          }
        );
        const data: any = await res.json().catch(() => ({}));
        const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim();
        return {
          model,
          ok: res.ok && !!text,
          status: res.status,
          ms: Date.now() - t,
          answer: text.slice(0, 40) || undefined,
          error: res.ok ? (text ? undefined : "Empty response") : String(data?.error?.message || "request failed").slice(0, 300),
        };
      } catch (e: any) {
        return { model, ok: false, status: 0, ms: Date.now() - t, error: e?.name === "AbortError" ? "Timed out (25s)" : String(e?.message || e).slice(0, 300) };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return NextResponse.json({
    ok: results.some((r) => r.ok),
    note: "ok=true for at least one model means builds can run. A model with status 404 does not exist; 429 = quota / rate limit; 400/403 = key or permission problem.",
    primaryModel: models[0],
    results,
  });
}
