import NextAuth, { CredentialsSignin } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

const MIN_PASSWORD_LENGTH = 8;

// Email address inside a Google id_token (the signed "who is this" ticket Google sends back).
function emailFromIdToken(idToken?: string | null): string | null {
  try {
    if (!idToken) return null;
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * THE BUG THAT KEPT SHOWING THE WRONG ACCOUNT: when somebody is already logged in and then signs in
 * with a different Google account, Auth.js silently ATTACHES that second Google account to the
 * logged-in user (and keeps them logged in as the old person). From then on the new Gmail always
 * opens the old account. This guard refuses to attach a Google account whose email belongs to
 * somebody else.
 */
const baseAdapter = PrismaAdapter(db) as Adapter;
const adapter: Adapter = {
  ...baseAdapter,
  async linkAccount(account) {
    const googleEmail = emailFromIdToken(account.id_token);
    if (googleEmail) {
      const owner = await db.user.findUnique({ where: { id: account.userId }, select: { email: true } });
      if (owner && owner.email.toLowerCase() !== googleEmail) {
        throw new Error("ACCOUNT_MISMATCH: this Google account belongs to a different user");
      }
    }
    return baseAdapter.linkAccount!(account);
  },
};

// Shown to the user on the landing page (see app/page.tsx -> AUTH_ERRORS).
class PasswordTooShortError extends CredentialsSignin {
  code = "password_too_short";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Always show Google's account chooser. Without this Chrome silently signs in with the
      // last Google account, so a person with a NEW Gmail kept landing in the OLD account.
      authorization: { params: { prompt: "select_account" } },
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        // Returning null => the client receives the generic "CredentialsSignin" error.
        // (Throwing a plain Error here shows up in the browser as "Configuration".)
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });

        // Unknown email => create the account (sign-up).
        if (!user) {
          if (password.length < MIN_PASSWORD_LENGTH) {
            throw new PasswordTooShortError();
          }
          const hashedPassword = await bcrypt.hash(password, 10);
          const created = await db.user.create({
            data: {
              email,
              name: email.split("@")[0],
              password: hashedPassword,
              termsAccepted: false,
            },
          });
          return { id: created.id, name: created.name, email: created.email };
        }

        // Account exists but has no password => it was created with Google.
        // It must NOT be possible to log into it with an arbitrary password.
        if (!user.password) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    // Runs on every sign-in and every session read.
    // 1) On sign-in `user` is the account that JUST logged in: the cookie is bound to it, so an old
    //    login (for example another Gmail) can never survive a new sign-in.
    // 2) Name / email / photo are re-read from the database each time, so a profile change shows up
    //    everywhere (server pages and APIs) without logging out and in again.
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (token.sub) {
        try {
          const u = await db.user.findUnique({
            where: { id: token.sub },
            select: { name: true, email: true, image: true },
          });
          if (u) {
            token.name = u.name;
            token.email = u.email;
            token.picture = u.image;
          }
        } catch {
          // database unreachable: keep what the cookie already has
        }
      }
      return token;
    },
    // With the JWT strategy Auth.js only exposes name/email/image on the session.
    // Without this callback `session.user.id` is always undefined, which made
    // /api/orchestrate and /api/history answer 401 for logged-in users.
    async session({ session, token }) {
      if (session.user && token?.sub) {
        session.user.id = token.sub;
        session.user.name = (token.name as string | null | undefined) ?? session.user.name;
        session.user.email = (token.email as string | undefined) ?? session.user.email;
        session.user.image = (token.picture as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/", // show sign-in errors on our own landing page
  },
});
