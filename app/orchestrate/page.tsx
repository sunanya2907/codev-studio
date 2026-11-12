import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import EditorClient from "./EditorClient";

// Always rendered for the person who is signed in right now, never served from a cache.
export const dynamic = "force-dynamic";

export default async function OrchestratePage() {
  const session = await auth();

  if (!session?.user?.id && !session?.user?.email) {
    redirect("/");
  }

  // The account is found by its id (an email can never point to the wrong person).
  const dbUser = session.user.id
    ? await db.user.findUnique({ where: { id: session.user.id } })
    : await db.user.findUnique({ where: { email: session.user.email! } });

  // The login cookie points to an account that is not in this database (deleted / other DB):
  // send them to log in again instead of a consent page that can never save.
  if (!dbUser) {
    redirect("/?error=SessionExpired");
  }
  if (!dbUser.termsAccepted) {
    redirect("/terms-consent");
  }

  return (
    <EditorClient
      userName={dbUser.name || dbUser.email.split("@")[0] || "Developer"}
      userEmail={dbUser.email}
      userImage={dbUser.image}
    />
  );
}