// app/orchestrate/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import EditorClient from "./EditorClient";

export default async function OrchestratePage() {
  // 1. Verify the user is logged in
  const session = await auth();

  // 2. If no session exists, bounce them back to the landing page
  if (!session?.user) {
    redirect("/");
  }

  // 3. If authenticated, load the Triple-Agent Editor and pass their name in
  return <EditorClient userName={session.user.name} />;
}