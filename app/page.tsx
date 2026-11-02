import Landing from "@/components/Landing";
import { db } from "@/lib/db";

// The home page is rebuilt at most every 5 minutes, so the live number below costs
// almost nothing and the page still opens instantly.
export const revalidate = 300;

async function countFinishedBuilds(): Promise<number | null> {
  try {
    return await db.generationHistory.count({ where: { status: "DONE" } });
  } catch {
    return null; // the page must still open if the database is unreachable
  }
}

export default async function HomePage() {
  const builds = await countFinishedBuilds();
  return <Landing builds={builds} />;
}
