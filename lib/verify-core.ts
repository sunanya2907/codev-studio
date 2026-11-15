// Pure helpers for the email code check (no database, no network), so they are easy to test.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 10 * 60 * 1000; // a code works for 10 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000; // at most one email per minute
export const MAX_ATTEMPTS = 5; // wrong guesses allowed per code

/** A random 6-digit code such as "042917". */
export const newCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

/** Accepts "123456" or "123 456"; returns null for anything that is not exactly 6 digits. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const c = input.replace(/\s+/g, "");
  return /^\d{6}$/.test(c) ? c : null;
}

export const hashCode = (userId: string, code: string, pepper: string) =>
  createHash("sha256").update(`${userId}:${code}:${pepper}`).digest("hex");

export function codeMatches(storedHash: string, userId: string, code: string, pepper: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashCode(userId, code, pepper), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const isExpired = (expiresAt: Date, now = new Date()) => expiresAt.getTime() <= now.getTime();

/** Milliseconds the user still has to wait before another email may be sent (0 = may send now). */
export const cooldownLeftMs = (sentAt: Date, now = new Date()) =>
  Math.max(0, sentAt.getTime() + RESEND_COOLDOWN_MS - now.getTime());

/** "sunanya2907@gmail.com" -> "s*********7@gmail.com" */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "your email";
  const shown = name.length <= 2 ? name[0] ?? "" : `${name[0]}${"*".repeat(Math.min(name.length - 2, 8))}${name[name.length - 1]}`;
  return `${shown}@${domain}`;
}
