import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { VOICE_SECONDS_PER_TOKEN } from "@/lib/plans";
import { getBillingState } from "@/lib/tokens";
import { chargeElapsed, endVoiceSession, startVoiceSession } from "@/lib/voice";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

    let body: { action?: unknown; sessionId?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

    if (body.action === "start") {
      await getBillingState(userId); // applies the monthly token refill if due
      const started = await startVoiceSession(userId);
      if (!started.ok) {
        return NextResponse.json(
          {
            error: `Voice needs 1 token (= ${VOICE_SECONDS_PER_TOKEN / 60} minutes of talking). You have no tokens left. Buy extra tokens or upgrade your plan.`,
            code: "OUT_OF_TOKENS",
          },
          { status: 402 }
        );
      }
      return NextResponse.json({ ...started, secondsPerToken: VOICE_SECONDS_PER_TOKEN });
    }

    if (body.action === "tick") {
      const r = await chargeElapsed(userId, sessionId);
      return NextResponse.json(r);
    }

    if (body.action === "end") {
      const remainingSeconds = await endVoiceSession(userId, sessionId);
      return NextResponse.json({ state: "ended", remainingSeconds });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err) {
    console.error("VOICE SESSION ERROR:", err);
    return NextResponse.json({ error: "Voice request failed. Please try again." }, { status: 500 });
  }
}
