import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminGuard, bucketByDay, usersById } from "@/lib/admin";
import { modelChain } from "@/lib/ai";

export const dynamic = "force-dynamic";

type Spec = { name: string; label: string; secret: boolean; required?: boolean; alt?: string };

// Which keys are set. A secret is NEVER sent to the browser: only "set" and its last 4 characters.
const GROUPS: { group: string; note: string; vars: Spec[] }[] = [
  {
    group: "AI (Gemini)", note: "Every build, question, voice turn and review uses this key.",
    vars: [
      { name: "GEMINI_API_KEY", label: "Gemini API key", secret: true, required: true },
      { name: "GEMINI_MODEL", label: "Main model", secret: false },
      { name: "GEMINI_FALLBACK_MODELS", label: "Fallback models", secret: false },
      { name: "GEMINI_THINKING_BUDGET", label: "Thinking budget", secret: false },
    ],
  },
  {
    group: "Sign-in", note: "Google login and session signing.",
    vars: [
      { name: "AUTH_SECRET", label: "Auth secret", secret: true, required: true, alt: "NEXTAUTH_SECRET" },
      { name: "AUTH_GOOGLE_ID", label: "Google client ID", secret: false, required: true },
      { name: "AUTH_GOOGLE_SECRET", label: "Google client secret", secret: true, required: true },
      { name: "AUTH_URL", label: "Auth URL", secret: false, alt: "NEXTAUTH_URL" },
    ],
  },
  { group: "Database", note: "", vars: [{ name: "DATABASE_URL", label: "Database URL", secret: true, required: true }] },
  {
    group: "Payments", note: "Stripe (cards) and Razorpay (India).",
    vars: [
      { name: "STRIPE_SECRET_KEY", label: "Stripe secret key", secret: true },
      { name: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhook secret", secret: true },
      { name: "RAZORPAY_KEY_ID", label: "Razorpay key ID", secret: false },
      { name: "RAZORPAY_KEY_SECRET", label: "Razorpay key secret", secret: true },
      { name: "RAZORPAY_WEBHOOK_SECRET", label: "Razorpay webhook secret", secret: true },
    ],
  },
  {
    group: "Email and domains", note: "Verification codes and domain search.",
    vars: [
      { name: "EMAIL_SERVER", label: "Email server", secret: true },
      { name: "EMAIL_FROM", label: "Email sender", secret: false },
      { name: "VERCEL_TOKEN", label: "Vercel token (domains)", secret: true },
      { name: "VERCEL_TEAM_ID", label: "Vercel team ID", secret: false },
    ],
  },
  {
    group: "App", note: "",
    vars: [
      { name: "NEXT_PUBLIC_APP_URL", label: "Public app URL", secret: false },
      { name: "ADMIN_EMAILS", label: "Admin emails", secret: false },
      { name: "CRON_SECRET", label: "Cron secret", secret: true },
      { name: "DEBUG_AGENT", label: "Debug agent", secret: false },
      { name: "LOG_RETENTION_DAYS", label: "Keep logs (days)", secret: false },
    ],
  },
];

const mask = (v: string) => (v.length > 12 ? `••••${v.slice(-4)}` : "•••• (set)");

export async function GET() {
  const g = await adminGuard();
  if (g.res) return g.res;

  const keys = GROUPS.map((gr) => ({
    group: gr.group,
    note: gr.note,
    vars: gr.vars.map((s) => {
      const used = process.env[s.name]?.trim() ? s.name : s.alt && process.env[s.alt]?.trim() ? s.alt : "";
      const v = used ? (process.env[used] as string).trim() : "";
      return {
        name: s.name, label: s.label, required: !!s.required, secret: s.secret,
        set: !!v, usedName: used && used !== s.name ? used : undefined,
        display: !v ? null : s.secret ? mask(v) : v.length > 80 ? `${v.slice(0, 77)}...` : v,
      };
    }),
  }));

  const d1 = new Date(Date.now() - 86400000);
  const d7 = new Date(Date.now() - 7 * 86400000);
  const d14 = new Date(Date.now() - 14 * 86400000);
  const [byModel, byPurpose, perUser, failures, rows24, rows14] = await Promise.all([
    db.aiCallLog.groupBy({
      by: ["model", "ok"], where: { createdAt: { gte: d7 } },
      _count: { _all: true }, _avg: { ms: true }, _sum: { tokensIn: true, tokensOut: true },
    }),
    db.aiCallLog.groupBy({
      by: ["purpose"], where: { createdAt: { gte: d7 } },
      _count: { _all: true }, _sum: { tokensIn: true, tokensOut: true },
    }),
    db.aiCallLog.groupBy({
      by: ["userId"], where: { createdAt: { gte: d7 }, userId: { not: null } },
      _count: { _all: true }, _sum: { tokensIn: true, tokensOut: true },
      orderBy: { _sum: { tokensOut: "desc" } }, take: 10,
    }),
    db.aiCallLog.findMany({ where: { ok: false }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.aiCallLog.aggregate({ where: { createdAt: { gte: d1 } }, _count: { _all: true }, _sum: { tokensIn: true, tokensOut: true } }),
    db.aiCallLog.findMany({ where: { createdAt: { gte: d14 } }, select: { createdAt: true, ok: true }, take: 50000 }),
  ]);
  const names = await usersById(perUser.map((p) => p.userId));

  // one row per model with success / failure counts
  const models = new Map<string, { model: string; ok: number; failed: number; avgMs: number; tokensIn: number; tokensOut: number }>();
  for (const r of byModel) {
    const m = models.get(r.model) ?? { model: r.model, ok: 0, failed: 0, avgMs: 0, tokensIn: 0, tokensOut: 0 };
    if (r.ok) {
      m.ok += r._count._all;
      m.avgMs = Math.round(r._avg.ms ?? 0);
    } else {
      m.failed += r._count._all;
    }
    m.tokensIn += r._sum.tokensIn ?? 0;
    m.tokensOut += r._sum.tokensOut ?? 0;
    models.set(r.model, m);
  }

  return NextResponse.json({
    keys,
    modelChain: modelChain(),
    usage: {
      calls24h: rows24._count._all,
      tokensIn24h: rows24._sum.tokensIn ?? 0,
      tokensOut24h: rows24._sum.tokensOut ?? 0,
      models: [...models.values()].sort((a, b) => b.ok + b.failed - (a.ok + a.failed)),
      purposes: byPurpose.map((p) => ({ purpose: p.purpose || "other", n: p._count._all, tokensIn: p._sum.tokensIn ?? 0, tokensOut: p._sum.tokensOut ?? 0 })),
      topUsers: perUser.map((p) => ({
        userId: p.userId, email: names.get(p.userId as string)?.email ?? "(deleted user)",
        calls: p._count._all, tokensIn: p._sum.tokensIn ?? 0, tokensOut: p._sum.tokensOut ?? 0,
      })),
      failures,
      series: {
        calls: bucketByDay(rows14.map((r) => r.createdAt), 14),
        failed: bucketByDay(rows14.filter((r) => !r.ok).map((r) => r.createdAt), 14),
      },
    },
  });
}
