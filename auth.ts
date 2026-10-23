// auth.ts (at the root of your project)
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
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
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        let user = await db.user.findUnique({ where: { email } });

        if (!user) {
          const hashedPassword = await bcrypt.hash(password, 10);
          user = await db.user.create({
            data: {
              email,
              name: email.split("@")[0],
              password: hashedPassword,
              termsAccepted: false,
            },
          });
        } else if (user.password) {
          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) throw new Error("Invalid password");
        }

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
});