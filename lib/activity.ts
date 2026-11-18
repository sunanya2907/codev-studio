import "server-only";
// Activity tracking for the admin dashboard (/admin).
//
//   clientInfo()      who is calling: IP, country / region / city (from the hosting provider's headers), device
//   logLogin()        login / logout / failed login  -> LoginEvent (+ "last seen" fields on the user)
//   logActivity()     what a person did and typed    -> UserActivity (build, search, voice, ...)
//   logAiCall()       every AI provider call         -> AiCallLog (usage, errors, latency)
//   logAdminAction()  every change an admin makes    -> AdminAction (audit trail)
//
// Every function swallows its own errors: tracking must NEVER break a login or a build.
//
// Location: Vercel (x-vercel-ip-*), Cloudflare (cf-ipcountry) and CloudFront send the visitor's
// country / city as request headers. On localhost or a host without them the location is simply
// "Unknown". The IP address is always stored. Mention this in your privacy policy (/terms).
import { headers } from "next/headers";
import { db } from "@/lib/db";

export type ClientInfo = {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  userAgent: string | null;
};

const clip = (v: string | null | undefined, n: number) => (v ? String(v).slice(0, n) : null);

function safeDecode(v: string | null) {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** "Chrome on Windows", "Safari on iPhone (mobile)" ... */
export function describeDevice(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "unknown OS";
  return `${browser} on ${os}${/Mobile/.test(ua) ? " (mobile)" : ""}`;
}

export async function clientInfo(): Promise<ClientInfo> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    let ip = fwd || h.get("x-real-ip") || h.get("cf-connecting-ip") || null;
    if (ip === "::1" || ip === "127.0.0.1") ip = "localhost";
    const ua = h.get("user-agent");
    return {
      ip: clip(ip, 64),
      country: clip(h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || h.get("cloudfront-viewer-country"), 8),
      region: clip(safeDecode(h.get("x-vercel-ip-country-region")), 64),
      city: clip(safeDecode(h.get("x-vercel-ip-city")), 80),
      device: clip(describeDevice(ua), 80),
      userAgent: clip(ua, 400),
    };
  } catch {
    // called outside a request (for example from a background job)
    return { ip: null, country: null, region: null, city: null, device: null, userAgent: null };
  }
}

// Old rows are deleted now and then so the log tables cannot grow forever (LOG_RETENTION_DAYS, default 180).
async function maybePrune() {
  if (Math.random() > 0.005) return;
  const days = Math.max(7, Number(process.env.LOG_RETENTION_DAYS) || 180);
  const cutoff = new Date(Date.now() - days * 86400000);
  await Promise.all([
    db.loginEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.userActivity.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.aiCallLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
}

export async function logLogin(e: {
  userId?: string | null;
  email?: string | null;
  type: "LOGIN" | "LOGOUT" | "LOGIN_FAILED";
  method?: string | null;
}) {
  try {
    const c = await clientInfo();
    await db.loginEvent.create({
      data: {
        userId: e.userId || null,
        email: clip(e.email?.toLowerCase(), 190),
        type: e.type,
        method: clip(e.method, 40),
        ip: c.ip,
        country: c.country,
        region: c.region,
        city: c.city,
        device: c.device,
        userAgent: c.userAgent,
      },
    });
    if (e.userId && e.type === "LOGIN") {
      await db.user.update({
        where: { id: e.userId },
        data: {
          lastLoginAt: new Date(),
          lastIp: c.ip,
          lastCountry: c.country,
          lastCity: c.city,
          loginCount: { increment: 1 },
        },
      });
    } else if (e.userId && e.type === "LOGOUT") {
      await db.user.update({ where: { id: e.userId }, data: { lastLogoutAt: new Date() } });
    }
    await maybePrune();
  } catch (err) {
    console.error("TRACKING logLogin failed:", err instanceof Error ? err.message : err);
  }
}

export type ActivityKind =
  | "BUILD"
  | "CUSTOMIZE"
  | "QUESTIONS"
  | "ENHANCE"
  | "DOMAIN_SEARCH"
  | "VOICE"
  | "TESTER_REDEEM"
  | "REQUEST";

export async function logActivity(userId: string | null | undefined, kind: ActivityKind, detail?: string | null, tokens = 0) {
  if (!userId) return;
  try {
    const c = await clientInfo();
    await db.userActivity.create({
      data: { userId, kind, detail: clip(detail, 2000), tokens, ip: c.ip, country: c.country, city: c.city },
    });
  } catch (err) {
    console.error("TRACKING logActivity failed:", err instanceof Error ? err.message : err);
  }
}

export async function logAiCall(d: {
  userId?: string | null;
  purpose?: string | null;
  model: string;
  ok: boolean;
  ms: number;
  error?: string | null;
  tokensIn?: number;
  tokensOut?: number;
}) {
  try {
    await db.aiCallLog.create({
      data: {
        userId: d.userId || null,
        purpose: clip(d.purpose, 40),
        model: clip(d.model, 80) || "unknown",
        ok: d.ok,
        ms: Math.max(0, Math.round(d.ms)),
        error: clip(d.error, 600),
        tokensIn: Math.max(0, Math.round(d.tokensIn || 0)),
        tokensOut: Math.max(0, Math.round(d.tokensOut || 0)),
      },
    });
  } catch (err) {
    console.error("TRACKING logAiCall failed:", err instanceof Error ? err.message : err);
  }
}

export async function logAdminAction(adminEmail: string, action: string, targetUserId?: string | null, detail?: string | null) {
  try {
    await db.adminAction.create({
      data: { adminEmail: adminEmail.toLowerCase(), action: clip(action, 60) || "unknown", targetUserId: targetUserId || null, detail: clip(detail, 1000) },
    });
  } catch (err) {
    console.error("TRACKING logAdminAction failed:", err instanceof Error ? err.message : err);
  }
}
