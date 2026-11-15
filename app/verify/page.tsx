import { redirect } from "next/navigation";
import { auth } from "@/auth";
import VerifyClient from "./VerifyClient";

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const session = await auth();
  const u = session?.user as { id?: string; pendingVerification?: boolean } | undefined;
  if (u?.id) redirect("/orchestrate"); // already verified
  if (!u?.pendingVerification) redirect("/"); // not signed in
  return <VerifyClient />;
}
