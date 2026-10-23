import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import EditorClient from "./EditorClient";

export default async function OrchestratePage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/");
  }

  const dbUser = await db.user.findUnique({
    where: { email: session.user.email },
  });

  if (!dbUser || !dbUser.termsAccepted) {
    redirect("/terms-consent");
  }

  return <EditorClient userName={session.user.name || "Developer"} />;
}