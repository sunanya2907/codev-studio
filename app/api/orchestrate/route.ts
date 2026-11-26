import { NextResponse } from "next/server";
import { reportError } from "@/lib/debug-agent";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ADVANCED_BUILD_COST, BUILD_COST, CUSTOMIZE_COST, STANDARD_PRICE_LABEL, TOKEN_PRICE_LABEL } from "@/lib/plans";
import { getBillingState, reserveTokens, refundTokens } from "@/lib/tokens";
import { cleanPath, normalizeFiles, parseFiles, serializeFiles, type GenFile } from "@/lib/files";
import { failBuild, reconcileStaleBuilds } from "@/lib/builds";
import { qaPendingText } from "@/lib/qa-review";
import { logActivity } from "@/lib/activity";
import { parseAttachments } from "@/lib/attachments";
import { validateBackend, validateFrontend, validateSchema, validateSrs } from "@/lib/validate";
import { contractSections, mergeContract, validateContract } from "@/lib/contract";
import { isHealthcareIdea } from "@/lib/healthcare";
import { addTrackingBackendFiles, addTrackingFrontendFiles, isTrackingIdea } from "@/lib/tracking";
import { AiNotConfiguredError, AiUnavailableError, aiConfigured, generateText, type GenerateOptions } from "@/lib/ai";
import {
  contractPrompt,
  srsPrompt,
  frontendPrompt,
  FRONTEND_PARTS,
  backendPrompt,
  databasePrompt,
  customizePrompt,
} from "@/lib/agents";

// A full build makes several AI calls (1, then 4 in parallel). That easily exceeds
// the default serverless timeout on Vercel and shows up as a 504 / "Unexpected token '<'".
// The build is now 3 steps (SRS -> frontend/backend/database in parallel -> QA review) and
// the output is much bigger. If Vercel rejects 300 on your plan, lower this to 60.
export const maxDuration = 300;

// The AI provider (Gemini only) lives in lib/ai.ts.
// The model name is env-configurable there (GEMINI_MODEL).

const MAX_PROMPT_LENGTH = 2000; // idea (max 1000 in the editor) + the answers to the 3 questions
const MAX_ADVANCED_PROMPT_LENGTH = 6000; // idea + the answers to the advanced website questions
const MAX_INSTRUCTION_LENGTH = 3000;
const MAX_CODE_LENGTH = 600000; // a full-size frontend (20 to 35 files) is well above the old 150000 limit

// Managed thinking: how many "thinking" tokens each agent may use. Enough to plan well, small enough that the
// build finishes inside the time limit (a huge budget made builds time out). GEMINI_THINKING_BUDGET overrides all of them.
const THINK: Record<string, number> = { spec: 2048, frontend: 4096, backend: 4096, database: 1024 };

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
          error: `You have used all your plan tokens! This action costs ${cost} token${cost === 1 ? "" : "s"}. Buy extra tokens for ${TOKEN_PRICE_LABEL} each or upgrade your plan.`,
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
      const result = await generateText(systemPrompt, { deadline, meta: { userId: session.user?.id, purpose: agent ? "customize" : "build" }, ...extra });
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

      const attached = parseAttachments(body.attachments);
      if (!attached.ok) return NextResponse.json({ error: attached.error }, { status: 413 });

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
        const isFileModule = agent === "frontend" || agent === "backend";
        const defaultPath = agent === "backend" ? "app/api/route.ts" : "app/page.tsx";

        // Context the build agents had: the idea and the contract (SRS sections 5, 6, 7). Read from the saved build
        // (ownership checked); the editor's own spec is used when it is newer (the person may have edited it).
        const saved = historyId
          ? await db.generationHistory
              .findFirst({ where: { id: historyId, userId: session.user.id }, select: { prompt: true, spec: true, frontend: true, backend: true, database: true } })
              .catch(() => null)
          : null;
        const idea = (saved?.prompt || prompt).slice(0, 6000);
        const clientSpec = typeof body.spec === "string" && !/^\/\/ Locked on Free Plan/.test(body.spec) ? body.spec.slice(0, 120000) : "";
        const specText = agent === "spec" ? currentCode : clientSpec || saved?.spec || "";
        const contract = agent === "spec" ? "" : (contractSections(specText) || specText).slice(0, 60000);

        // Read-only hints from the other modules so new code lines up with what already exists.
        let siblings = "";
        if (agent === "frontend" && saved?.backend) {
          const routes = parseFiles(saved.backend, "app/api/route.ts").map((f) => f.path).filter((p) => /route\.ts$/.test(p));
          if (routes.length) siblings = `BACKEND ROUTES THAT EXIST (read-only):\n${routes.join("\n")}`;
        }
        if (agent === "backend" && saved?.database) siblings = `DATABASE SCHEMA (read-only):\n${saved.database.slice(0, 30000)}`;

        const basePrompt = customizePrompt(agent, { idea, instruction, currentCode, contract, siblings, attachmentsText: attached.textBlock });
        const think = isFileModule ? 4096 : 2048;

        // Pull the "ALSO UPDATE" line and the DELETE lines out of the answer.
        const ALSO = /^=== ALSO UPDATE:\s*(.*?)\s*===\s*$/im;
        const DEL = /^=== DELETE:\s*(.+?)\s*===\s*$/gim;
        const interpret = (raw: string) => {
          const also = (raw.match(ALSO)?.[1] || "")
            .toLowerCase()
            .split(/[,\s]+/)
            .filter((m) => ["spec", "frontend", "backend", "database"].includes(m) && m !== agent);
          const deletes = [...raw.matchAll(DEL)].map((m) => cleanPath(m[1])).filter((p): p is string => !!p);
          const text = raw.replace(ALSO, "").replace(DEL, "").trim();
          return { text, also: [...new Set(also)], deletes };
        };

        // File modules: the AI returns only the files it changed; they are merged over the existing files, so a
        // change can never wipe the other pages and the answer is never cut off by the output limit.
        const apply = (raw: string) => {
          const r = interpret(raw);
          if (!isFileModule) return { code: r.text, also: r.also, deletes: r.deletes };
          const existing = parseFiles(currentCode, defaultPath);
          const updates = parseFiles(r.text, defaultPath);
          if (!/^=== FILE: /m.test(r.text) && existing.length > 1) {
            return { code: currentCode, also: r.also, deletes: r.deletes, empty: true }; // no usable files came back
          }
          const merged = new Map(existing.map((f) => [f.path, f]));
          for (const u of updates) merged.set(u.path, u);
          for (const d of r.deletes) merged.delete(d);
          return { code: serializeFiles([...merged.values()]), also: r.also, deletes: r.deletes, empty: updates.length === 0 && r.deletes.length === 0 };
        };
        const check = (code: string): string[] =>
          agent === "frontend" ? validateFrontend(code) : agent === "backend" ? validateBackend(code) : agent === "database" ? validateSchema(code) : agent === "spec" ? validateSrs(code) : [];

        let result = apply(await callAI(basePrompt, { attachments: attached.media, thinkingBudget: think }));
        let issues = result.empty ? ["Your answer did not contain any files in the required format."] : check(result.code);
        if (issues.length) {
          // Same safety net as the build: tell the agent what is wrong and ask once more.
          const again = apply(
            await callAI(
              `${basePrompt}\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS. Fix all of them and answer again in the required format:\n- ${issues.join("\n- ")}`,
              { attachments: attached.media, thinkingBudget: 1024 }
            )
          );
          const issues2 = again.empty ? ["Your answer did not contain any files in the required format."] : check(again.code);
          if (issues2.length <= issues.length) {
            result = again;
            issues = issues2;
          }
        }
        if (result.empty || !result.code.trim() || (!isFileModule && agent !== "flow" && agent !== "qa" && issues.some((i) => /far too short|defines no models|no datasource/.test(i)))) {
          throw new Error("The change could not be applied this time. Your token was returned, please try again (a shorter, more specific instruction helps).");
        }

        let updatedCode = result.code;
        await logActivity(session.user.id, "CUSTOMIZE", `[${agent}] ${instruction}`, CUSTOMIZE_COST);
        if (isFileModule) updatedCode = normalizeFiles(updatedCode, defaultPath);

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
          alsoUpdate: result.also, // other modules that need a matching change
          warnings: issues,
          tier: user.tier,
          tokenBalance: balanceAfterReserve,
          aiProviders: providersUsed,
        });
      } catch (genError) {
        await refundTokens(session.user.id, CUSTOMIZE_COST);
        throw genError;
      }
    }

    // CASE 2: Full app build (costs BUILD_COST tokens, or ADVANCED_BUILD_COST for an advanced build). Streams live progress, and is stored in the
    // database from the first second, so closing the tab can never lose a build or a token.
    if (!prompt) {
      return NextResponse.json({ error: "Please describe the app you want to build." }, { status: 400 });
    }
    const advanced = body.advanced === true;
    const buildCost = advanced ? ADVANCED_BUILD_COST : BUILD_COST;
    const maxPrompt = advanced ? MAX_ADVANCED_PROMPT_LENGTH : MAX_PROMPT_LENGTH;
    if (prompt.length > maxPrompt) {
      return NextResponse.json(
        { error: `Prompt is too long (max ${maxPrompt} characters).` },
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
    const balanceAfterReserve = await reserveTokens(userId, buildCost);
    if (balanceAfterReserve === null) return outOfTokens(buildCost);

    await logActivity(userId, "BUILD", `${advanced ? "[advanced] " : ""}${prompt}`, buildCost);

    let buildId: string;
    try {
      const row = await db.generationHistory.create({
        data: { userId, prompt, spec: "", frontend: "", backend: "", database: "", qa: "", status: "BUILDING", cost: buildCost },
        select: { id: true },
      });
      buildId = row.id;
    } catch (e) {
      await refundTokens(userId, buildCost);
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
          let text = clean(await callAI(basePrompt, { thinkingBudget: THINK[key] }));
          let issues = validate(text);
          if (issues.length) {
            event(key, "retry");
            const second = clean(
              await callAI(
                `${basePrompt}\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS. Fix all of them and return the COMPLETE corrected answer in the required format:\n- ${issues.join("\n- ")}`,
                { thinkingBudget: 1024 }
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
          let contract = await callAI(contractBase, { thinkingBudget: THINK.spec });
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
          const compactFrontend = isFree || (!!process.env.VERCEL && !process.env.BUILD_FULL_SITE && deadline - Date.now() < 300_000);
          console.log("FRONTEND SIZE", JSON.stringify({ buildId, compact: compactFrontend, secondsLeft: Math.round((deadline - Date.now()) / 1000) }));
          // Full size: three engineers write different pages at the same time (one call for everything timed out).
          const frontendFullRun = async (): Promise<string> => {
            event("frontend", "start");
            const t0 = Date.now();
            const onePart = async (i: number): Promise<GenFile[]> => {
              const text = await callAI(frontendPrompt(contract, tracking, healthcare, false, i), { thinkingBudget: THINK.frontend });
              if (!/^=== FILE: /m.test(text)) throw new Error(`Frontend part ${i + 1} had no files.`);
              return parseFiles(text, "app/page.tsx");
            };
            const settled = await Promise.allSettled(Array.from({ length: FRONTEND_PARTS }, (_, i) => onePart(i)));
            const parts: GenFile[][] = [];
            for (let i = 0; i < settled.length; i++) {
              let res = settled[i];
              if (res.status === "rejected" && deadline - Date.now() > 90_000) {
                event("frontend", "retry");
                res = (await Promise.allSettled([onePart(i)]))[0];
              }
              if (res.status === "fulfilled") parts.push(res.value);
              else if (i === 0) throw res.reason; // the home page and login pages are required
              else warnings.push(`Agent 2: part ${i + 1} of the frontend (${i === 1 ? "user area and feature pages" : "admin pages"}) could not be written this time. Use Customize UI to add it.`);
            }
            const byPath = new Map<string, GenFile>();
            for (const f of parts.flat()) if (!byPath.has(f.path)) byPath.set(f.path, f); // first writer wins (part 1 owns shared files)
            const merged = serializeFiles([...byPath.values()]);
            const issues = validateFrontend(merged);
            if (issues.some((x) => /^No |far too short/.test(x))) throw new Error(`Agent 2 could not produce a usable result (${issues[0]}). Please try again.`);
            issues.forEach((x) => warnings.push(`Agent 2: ${x}`));
            console.log("BUILD TIMING", JSON.stringify({ buildId, agent: "frontend", seconds: Math.round((Date.now() - t0) / 1000), files: byPath.size }));
            event("frontend", "done");
            return merged;
          };
          const frontendCompactRun = () =>
            runAgent("frontend", frontendPrompt(contract, tracking, healthcare, true), (t) => normalizeFiles(t, "app/page.tsx"), validateFrontend, false);
          // Safety net: if the full multi-part frontend fails (for example it runs out of time), fall back to the
          // compact frontend (home, login, register, admin login, dashboard) so the build still finishes.
          const frontendRun = async () => {
            if (compactFrontend) return runAgent("frontend", frontendPrompt(contract, tracking, healthcare, true), (t) => normalizeFiles(t, "app/page.tsx"), validateFrontend);
            try {
              return await frontendFullRun();
            } catch (e) {
              if (e instanceof AiNotConfiguredError || deadline - Date.now() < 60_000) throw e;
              console.error("FULL FRONTEND FAILED, using the compact frontend:", e instanceof Error ? e.message : e);
              warnings.push("Agent 2: the full-size frontend could not be finished in time, so a compact version (home, login, register, admin login, dashboard) was built. Use Customize UI to add more pages.");
              return frontendCompactRun();
            }
          };

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
              ? `${genError.message} Your ${"tokens were"} returned.`
              : `${genError instanceof Error && genError.message ? genError.message : "The build failed."} Your ${"tokens were"} returned.`;
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