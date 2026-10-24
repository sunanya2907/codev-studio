import NextAuth, { CredentialsSignin } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

const MIN_PASSWORD_LENGTH = 8;

// Shown to the user on the landing page (see app/page.tsx -> AUTH_ERRORS).
class PasswordTooShortError extends CredentialsSignin {
  code = "password_too_short";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
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
    // With the JWT strategy Auth.js only exposes name/email/image on the session.
    // Without this callback `session.user.id` is always undefined, which made
    // /api/orchestrate and /api/history answer 401 for logged-in users.
    async session({ session, token }) {
      if (session.user && token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
