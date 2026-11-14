import { NextResponse } from "next/server";
import { reportError } from "@/lib/debug-agent";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { BUILD_COST, CUSTOMIZE_COST, STANDARD_PRICE_LABEL } from "@/lib/plans";
import { getBillingState, reserveTokens, refundTokens } from "@/lib/tokens";
import { normalizeFiles } from "@/lib/files";
import { failBuild, reconcileStaleBuilds } from "@/lib/builds";
import { qaPendingText } from "@/lib/qa-review";
import { validateBackend, validateFrontend, validateSchema, validateSrs } from "@/lib/validate";
import { mergeContract, validateContract } from "@/lib/contract";
import { isHealthcareIdea } from "@/lib/healthcare";
import { addTrackingBackendFiles, addTrackingFrontendFiles, isTrackingIdea } from "@/lib/tracking";
import { AiNotConfiguredError, AiUnavailableError, aiConfigured, generateText, type GenerateOptions } from "@/lib/ai";
import {
  contractPrompt,
  srsPrompt,
  frontendPrompt,
  backendPrompt,
  databasePrompt,
  customizeHint,
} from "@/lib/agents";

// A full build makes several AI calls (1, then 4 in parallel). That easily exceeds
// the default serverless timeout on Vercel and shows up as a 504 / "Unexpected token '<'".
// The build is now 3 steps (SRS -> frontend/backend/database in parallel -> QA review) and
// the output is much bigger. If Vercel rejects 300 on your plan, lower this to 60.
export const maxDuration = 300;

// The AI provider (Gemini only) lives in lib/ai.ts.
// The model name is env-configurable there (GEMINI_MODEL).

const MAX_PROMPT_LENGTH = 1500; // idea (max 500 in the editor) + the answers to the 3 questions
const MAX_INSTRUCTION_LENGTH = 1000;
const MAX_CODE_LENGTH = 150000; // multi-file modules are bigger than the old single files

const AGENT_KEYS = ["spec", "frontend", "backend", "database", "qa", "flow"] as const;
type AgentKey = (typeof AGENT_KEYS)[number];

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Please sign in to generate apps." },
        { status: 401 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const agent = typeof body.agent === "string" ? body.agent : undefined;
    const currentCode = typeof body.currentCode === "string" ? body.currentCode : "";
    const historyId = typeof body.historyId === "string" ? body.historyId : "";
    const instruction =
      typeof body.instruction === "string" ? body.instruction.trim() : "";

    if (!aiConfigured()) {
      return NextResponse.json(
        { error: new AiNotConfiguredError().message },
        { status: 500 }
      );
    }

    // Also applies the monthly token refill if this user's period has ended.
    const user = await getBillingState(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const outOfTokens = (cost: number) =>
      NextResponse.json(
        {
          error: `You have used all your plan tokens! This action costs ${cost} token${cost === 1 ? "" : "s"}. Buy extra tokens for $1 each or upgrade your plan.`,
          code: "OUT_OF_TOKENS",
        },
        { status: 402 }
      );

    // Stop starting new provider attempts shortly before Vercel kills the function.
    // On Vercel the function is killed at maxDuration, so stop early there. On localhost there is no such limit,
    // so give the whole 5-agent build 20 minutes (a full build here takes ~5 minutes).
    const deadline = Date.now() + (process.env.VERCEL ? (maxDuration - 15) * 1000 : 20 * 60 * 1000);
    const providersUsed: string[] = [];

    const callAI = async (systemPrompt: string, extra: Partial<GenerateOptions> = {}) => {
      // Gemini only; temporary errors are retried inside lib/ai.ts.
      const result = await generateText(systemPrompt, { deadline, ...extra });
      if (!providersUsed.includes(result.provider)) providersUsed.push(result.provider);
      let text = result.text.trim();

      // Models often wrap the whole answer in ONE ```lang fence. Remove only that
      // outer wrapper. (The old code stripped every fence, which destroyed the code
      // blocks inside the Markdown spec.)
      const fenceCount = (text.match(/```/g) || []).length;
      if (fenceCount === 2 && text.startsWith("```") && text.endsWith("```")) {
        text = text
          .replace(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n?/, "")
          .replace(/\r?\n?```$/, "")
          .trim();
      }
      return text;
    };

    // CASE 1: Single-agent customization ("Customize Spec", "Customize UI", ...)
    if (agent && instruction) {
      if (!AGENT_KEYS.includes(agent as AgentKey)) {
        return NextResponse.json({ error: "Unknown agent." }, { status: 400 });
      }
      if (
        instruction.length > MAX_INSTRUCTION_LENGTH ||
        currentCode.length > MAX_CODE_LENGTH
      ) {
        return NextResponse.json(
          { error: "Instruction or code is too long." },
          { status: 413 }
        );
      }

      // Free users can only preview; code (and editing it) is a paid feature
      if (user.tier === "FREE") {
        return NextResponse.json(
          {
            error:
              `Free Plan only includes the Live Preview. Upgrade to Standard (${STANDARD_PRICE_LABEL}) to view, edit and export the code!`,
            code: "PLAN_LOCKED",
          },
          { status: 403 }
        );
      }

      // Customizing is a paid AI call, so it costs tokens just like a build.
      // Reserve first (atomic), refund if every AI provider fails.
      const balanceAfterReserve = await reserveTokens(session.user.id, CUSTOMIZE_COST);
      if (balanceAfterReserve === null) return outOfTokens(CUSTOMIZE_COST);

      try {
        const customPrompt = `You are a senior full-stack AI agent updating the "${agent}" module.\n${customizeHint(agent)}\n\nCurrent Code/Spec:\n${currentCode}\n\nUser Instruction: ${instruction}\n\nReturn ONLY the updated code or markdown without explanations.`;
        let updatedCode = await callAI(customPrompt);
        if (agent === "frontend") updatedCode = normalizeFiles(updatedCode, "app/page.tsx");
        if (agent === "backend") updatedCode = normalizeFiles(updatedCode, "app/api/route.ts");

        // Persist the edit so it survives a refresh / closing the tab.
        if (historyId) {
          await db.generationHistory
            .updateMany({
              where: { id: historyId, userId: session.user.id }, // ownership check
              data: { [agent]: updatedCode },
            })
            .catch((e: unknown) => console.error("HISTORY UPDATE FAILED:", e));
        }

        return NextResponse.json({
          updatedCode,
          tier: user.tier,
          tokenBalance: balanceAfterReserve,
          aiProviders: providersUsed,
        });
      } catch (genError) {
        await refundTokens(session.user.id, CUSTOMIZE_COST);
        throw genError;
      }
    }

    // CASE 2: Full app build (costs 1 token). Streams live progress, and is stored in the
    // database from the first second, so closing the tab can never lose a build or a token.
    if (!prompt) {
      return NextResponse.json({ error: "Please describe the app you want to build." }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).` },
        { status: 413 }
      );
    }

    const userId = session.user.id;
    await reconcileStaleBuilds(userId); // returns tokens of builds that were killed earlier

    const running = await db.generationHistory.count({ where: { userId, status: "BUILDING" } });
    if (running > 0) {
      return NextResponse.json(
        { error: "You already have a build running. Wait for it to finish (it also appears in History)." },
        { status: 409 }
      );
    }

    // Reserve the token atomically BEFORE the expensive work.
    const balanceAfterReserve = await reserveTokens(userId, BUILD_COST);
    if (balanceAfterReserve === null) return outOfTokens(BUILD_COST);

    let buildId: string;
    try {
      const row = await db.generationHistory.create({
        data: { userId, prompt, spec: "", frontend: "", backend: "", database: "", qa: "", status: "BUILDING" },
        select: { id: true },
      });
      buildId = row.id;
    } catch (e) {
      await refundTokens(userId, BUILD_COST);
      throw e;
    }

    const isFree = user.tier === "FREE";
    const healthcare = isHealthcareIdea(prompt); // doctor / patient apps get privacy + role rules
    const tracking = isTrackingIdea(prompt); // GPS / live-tracking apps get extra rules + a ready-made map
    const enc = new TextEncoder();
    let clientConnected = true;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: Record<string, unknown>) => {
          if (!clientConnected) return;
          try {
            controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
          } catch {
            clientConnected = false; // the user left; the build carries on and is saved
          }
        };
        const event = (agent: AgentKey, status: "start" | "retry" | "done") =>
          send({ type: "agent", agent, status });
        const warnings: string[] = [];

        // One agent: run, check the answer, ask once more if it is broken.
        const runAgent = async (
          key: AgentKey,
          basePrompt: string,
          clean: (t: string) => string,
          validate: (t: string) => string[],
          emitStart = true
        ): Promise<string> => {
          if (emitStart) event(key, "start");
          const t0 = Date.now();
          let text = clean(await callAI(basePrompt));
          let issues = validate(text);
          if (issues.length) {
            event(key, "retry");
            const second = clean(
              await callAI(
                `${basePrompt}\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS. Fix all of them and return the COMPLETE corrected answer in the required format:\n- ${issues.join("\n- ")}`
              )
            );
            const issues2 = validate(second);
            if (issues2.length <= issues.length) {
              text = second;
              issues = issues2;
            }
          }
          if (issues.some((i) => /^No |defines no models|no datasource|far too short/.test(i)) || !text.trim()) {
            throw new Error(`Agent ${AGENT_KEYS.indexOf(key) + 1} could not produce a usable result (${issues[0] || "empty answer"}). Please try again.`);
          }
          issues.forEach((i) => warnings.push(`Agent ${AGENT_KEYS.indexOf(key) + 1}: ${i}`));
          console.log("BUILD TIMING", JSON.stringify({ buildId, agent: key, seconds: Math.round((Date.now() - t0) / 1000) }));
          event(key, "done");
          return text;
        };

        const buildStartedAt = Date.now();
        try {
          const LOCKED = `// Locked on Free Plan. Upgrade to Standard (${STANDARD_PRICE_LABEL}) to view, edit and export the code.`;
          let frontend = LOCKED;
          let backend = LOCKED;
          let database = LOCKED;
          let qa = `# Locked on Free Plan\nUpgrade to Standard (${STANDARD_PRICE_LABEL}) or higher to unlock the code and the QA report.`;

          // Agent 1, step 1 (about 15 to 20 seconds): ONLY the contract (SRS sections 5, 6, 7). Agents 2, 3 and 4
          // start from it immediately, in parallel with the writing of the full SRS (step 2), instead of waiting
          // 60 to 80 seconds for the whole document.
          event("spec", "start");
          const contractBase = contractPrompt(prompt, tracking, healthcare);
          let contract = await callAI(contractBase);
          let contractIssues = validateContract(contract);
          if (contractIssues.length) {
            event("spec", "retry");
            const again = await callAI(`${contractBase}\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS. Fix all of them and return the COMPLETE corrected answer:\n- ${contractIssues.join("\n- ")}`);
            const again2 = validateContract(again);
            if (again2.length <= contractIssues.length) {
              contract = again;
              contractIssues = again2;
            }
          }
          if (contractIssues.length) {
            throw new Error(`Agent 1 could not produce a usable contract (${contractIssues[0]}). Please try again.`);
          }
          console.log("BUILD TIMING", JSON.stringify({ buildId, agent: "contract", seconds: Math.round((Date.now() - buildStartedAt) / 1000) }));

          // A big frontend (6 to 12 files) can take 200+ seconds to write, longer than Vercel's 300 second limit
          // leaves on the Hobby plan. So ask for a compact frontend for Live Preview builds, and whenever less than
          // ~300 seconds are left (always the case on Hobby). Local runs and a Pro plan with a longer limit keep the full size.
          const compactFrontend = isFree || (!!process.env.VERCEL && deadline - Date.now() < 300_000);
          console.log("FRONTEND SIZE", JSON.stringify({ buildId, compact: compactFrontend, secondsLeft: Math.round((deadline - Date.now()) / 1000) }));
          const frontendRun = () =>
            runAgent("frontend", frontendPrompt(contract, tracking, healthcare, compactFrontend), (t) => normalizeFiles(t, "app/page.tsx"), validateFrontend);

          // Agent 1, step 2: the full SRS document, written to match the contract. If this step fails, the build still
          // succeeds and the contract is saved as the SRS, because the code does not depend on the rest of the document.
          const specRun = async (): Promise<string> => {
            try {
              const full = await runAgent("spec", srsPrompt(prompt, tracking, healthcare, contract), (t) => t, validateSrs, false);
              return mergeContract(full, contract);
            } catch (e) {
              if (e instanceof AiNotConfiguredError) throw e;
              console.error("FULL SRS FAILED, saving the contract as the SRS:", e instanceof AiUnavailableError ? e.reason : e);
              warnings.push("Agent 1: the full requirements document could not be written this time; only the data model, API and pages (the contract the code was built from) are saved.");
              event("spec", "done");
              return contract;
            }
          };

          let spec = contract;
          if (isFree) {
            // Free builds only need the UI for the Live Preview (the SRS is locked), so the contract is enough.
            event("spec", "done");
            frontend = await frontendRun();
            if (tracking) frontend = addTrackingFrontendFiles(frontend);
          } else {
            // Agents 2, 3, 4 and the full SRS all run at the same time, from the same contract
            const jobs: (() => Promise<string>)[] = [
              () => frontendRun(),
              () => runAgent("backend", backendPrompt(contract, tracking, healthcare), (t) => normalizeFiles(t, "app/api/route.ts"), validateBackend),
              () => runAgent("database", databasePrompt(contract, tracking, healthcare), (t) => t, validateSchema),
              () => specRun(),
            ];
            // Several AI calls at once can hit a rate limit / overload on ONE of them. Re-run only the
            // ones that failed (once, while there is time left) instead of throwing the build away.
            const results: PromiseSettledResult<string>[] = await Promise.allSettled(jobs.map((j) => j()));
            for (let n = 0; n < jobs.length; n++) {
              if (results[n].status === "rejected" && deadline - Date.now() > 90_000) {
                await new Promise((r) => setTimeout(r, 3000));
                results[n] = (await Promise.allSettled([jobs[n]()]))[0];
              }
            }
            const failedJob = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
            if (failedJob) throw failedJob.reason;
            [frontend, backend, database, spec] = results.map((r) => (r as PromiseFulfilledResult<string>).value);
            if (tracking) {
              frontend = addTrackingFrontendFiles(frontend);
              backend = addTrackingBackendFiles(backend);
            }
            // Agent 5 (QA & security review) is NOT run here any more. It runs as its own request
            // (/api/orchestrate/qa) right after this build is saved, so it gets a fresh time budget
            // and can never make a finished build fail. The placeholder carries the small warnings.
            qa = qaPendingText(warnings);
          }

          await db.generationHistory.update({
            where: { id: buildId },
            data: { spec, frontend, backend, database, qa, status: "DONE", error: null },
          });

          console.log("BUILD TIMING", JSON.stringify({ buildId, total: true, seconds: Math.round((Date.now() - buildStartedAt) / 1000) }));
          send({
            type: "done",
            qaPending: !isFree,
            flowPending: !isFree,
            spec: isFree ? LOCKED : spec,
            frontend,
            backend,
            database,
            qa,
            historyId: buildId,
            tier: user.tier,
            tokenBalance: balanceAfterReserve,
            aiProviders: providersUsed,
          });
        } catch (genError) {
          console.error("BUILD FAILED:", genError, genError instanceof AiUnavailableError ? genError.reason : "");
          void reportError(genError, { source: "server", route: "/api/orchestrate", method: "POST" });
          const message =
            genError instanceof AiUnavailableError
              ? `${genError.message} Your token was returned.`
              : `${genError instanceof Error && genError.message ? genError.message : "The build failed."} Your token was returned.`;
          await failBuild(userId, buildId, message); // flips the row and refunds, once
          send({ type: "error", error: message });
        } finally {
          try {
            controller.close();
          } catch {}
        }
      },
      cancel() {
        clientConnected = false; // tab closed: keep building, the result lands in History
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("ORCHESTRATE ERROR:", error);
    void reportError(error, { source: "server", route: "/api/orchestrate", method: "POST" });
    const message =
      error instanceof AiUnavailableError
        ? `${error.message} Your token was not charged.`
        : error instanceof Error && error.message
        ? error.message
        : "Failed to orchestrate agents.";
    return NextResponse.json({ error: message }, { status: error instanceof AiUnavailableError ? 503 : 500 });
  }
}