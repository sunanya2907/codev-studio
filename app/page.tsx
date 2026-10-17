import { auth } from "@/auth";
import EditorClient from "./orchestrate/EditorClient";

export default async function OrchestratePage() {
  const session = await auth();
  const userName = session?.user?.name;

  return <EditorClient userName={userName} />;
}