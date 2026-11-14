import "server-only"; // build fails if a client component ever imports this file
import {
  SRS_TRACKING_ADDENDUM,
  FRONTEND_TRACKING_ADDENDUM,
  BACKEND_TRACKING_ADDENDUM,
  DATABASE_TRACKING_ADDENDUM,
  QA_TRACKING_ADDENDUM,
} from "@/lib/tracking";
import {
  SRS_HEALTH_ADDENDUM,
  FRONTEND_HEALTH_ADDENDUM,
  BACKEND_HEALTH_ADDENDUM,
  DATABASE_HEALTH_ADDENDUM,
  QA_HEALTH_ADDENDUM,
} from "@/lib/healthcare";

// Prompts for the 5 agents. Agent 1's SRS contains two BINDING contracts (data model and
// API contract). Agents 2, 3 and 4 all read them, so the frontend, the API and the
// database agree on names and shapes even though they run in parallel.

const FILE_FORMAT = `OUTPUT FORMAT (strict): return every file as
=== FILE: <relative/path.ext> ===
<complete file contents>
Start each file with that exact marker line on its own line. No markdown fences, no explanations, nothing before the first marker.`;

// Step 1 of Agent 1 (about 15 to 20 seconds): ONLY the three binding sections. Agents 2, 3 and 4 start from this
// immediately, while the full SRS (srsPrompt) is written at the same time.
export const contractPrompt = (idea: string, tracking = false, healthcare = false) => `You are Agent 1, a senior business analyst. For this web app idea:
"${idea}"
write ONLY the binding contract of its Software Requirements Specification, as Markdown. Other engineers start building the frontend, the API and the database from your text at once, so every name must be precise and consistent. Use exactly these headings, in this order:
# Contract: <app name>
## 5. Data Model  (BINDING CONTRACT. For every entity a table: field | type | constraints. Use camelCase fields and PascalCase entity names. Include id, createdAt, updatedAt and relations. If users must log in, the User entity includes email (unique) and passwordHash.)
## 6. API Contract  (BINDING CONTRACT. A table per resource: method | path | auth required | request JSON | success JSON | error cases. Paths under /api/..., consistent names that match section 5.)
## 7. Pages & UI Flows  (BINDING CONTRACT. For every page: route | purpose | main components | API endpoints it calls. Include a landing/dashboard page at "/".)

Rules: be specific and realistic for THIS idea, no placeholders, no filler, no other sections. Keep it under about 1,000 words. Return only the Markdown.${tracking ? SRS_TRACKING_ADDENDUM : ""}${healthcare ? SRS_HEALTH_ADDENDUM(tracking) : ""}`;

export const srsPrompt = (idea: string, tracking = false, healthcare = false, contract = "") => `You are Agent 1, a senior business analyst. Write a complete Software Requirements Specification (SRS) in Markdown, in the style of IEEE 830, for this web app idea:
"${idea}"

Use exactly these sections, in this order:
# Software Requirements Specification: <app name>
## 1. Introduction  (1.1 Purpose, 1.2 Scope, 1.3 Definitions)
## 2. Overall Description  (2.1 User roles, 2.2 Assumptions & constraints, 2.3 Tech stack: Next.js 15 App Router, TypeScript, Tailwind CSS, Prisma + PostgreSQL)
## 3. Functional Requirements  (numbered FR-01, FR-02, ... each with a priority [Must/Should/Could] and 1-3 acceptance criteria)
## 4. Non-Functional Requirements  (performance, security, accessibility, responsiveness)
## 5. Data Model  (BINDING CONTRACT. For every entity a table: field | type | constraints. Use camelCase fields and PascalCase entity names. Include id, createdAt, updatedAt and relations. If users must log in, the User entity includes email (unique) and passwordHash.)
## 6. API Contract  (BINDING CONTRACT. A table per resource: method | path | auth required | request JSON | success JSON | error cases. Paths under /api/..., consistent names that match section 5.)
## 7. Pages & UI Flows  (BINDING CONTRACT. For every page: route | purpose | main components | API endpoints it calls. Include a landing/dashboard page at "/".)
## 8. Out of Scope

Rules: be specific and realistic for THIS idea, no placeholders, no filler. Sections 5, 6 and 7 will be used verbatim by other engineers, so every name must be precise and consistent. Keep the whole document under about 2,500 words. Return only the Markdown.${tracking ? SRS_TRACKING_ADDENDUM : ""}${healthcare ? SRS_HEALTH_ADDENDUM(tracking) : ""}${contract ? `\n\nSECTIONS 5, 6 AND 7 ARE ALREADY FIXED: the frontend, API and database are being built from them right now. Reproduce the contract below VERBATIM as sections 5, 6 and 7 (do not rename or change anything in it), and write sections 1 to 4 and 8 so that they agree with it.\n\nCONTRACT:\n${contract}` : ""}`;

// compact = a smaller answer that fits a short time budget (Live Preview builds, or Vercel Hobby's 300 second limit).
const FRONTEND_SIZE_FULL = `Aim for roughly 6 to 12 files, complete and working, not stubs.`;
const FRONTEND_SIZE_COMPACT = `Aim for 5 to 7 files in total, complete and working, not stubs: app/page.tsx, at most 3 other pages, 2 to 3 small shared components, lib/types.ts and lib/api.ts. If SRS section 7 lists more pages, fold the secondary ones into tabs or sections of the pages you build, so every feature stays reachable. Keep every file under about 150 lines: dense Tailwind classes, no long comments, no repeated markup (map over arrays), no decorative extras. A SHORT answer is required: it must finish quickly.`;
export const frontendPrompt = (srs: string, tracking = false, healthcare = false, compact = false) => `You are Agent 2, a senior frontend engineer. Using ONLY the SRS below, build the WHOLE frontend as a multi-page Next.js 15 App Router + TypeScript + Tailwind CSS app.

Deliver:
- app/page.tsx : the main landing/dashboard page ("/").
- one app/<route>/page.tsx for every other page in SRS section 7 (dynamic routes like app/tasks/[id]/page.tsx are fine).
- components/*.tsx : reusable components (navbar, cards, forms, modals, empty/loading/error states).
- lib/types.ts : TypeScript types matching SRS section 5.
- lib/api.ts : small typed fetch helpers that call EXACTLY the paths, methods and JSON shapes from SRS section 6.
${compact ? FRONTEND_SIZE_COMPACT : FRONTEND_SIZE_FULL}

Rules:
- Every file using hooks, state or events starts with "use client";.
- Allowed imports ONLY: react, next/link, next/navigation, lucide-react, and your own files via "@/..." (for example "@/components/Navbar"). No other packages.
- Modern, responsive dark UI with Tailwind classes, real labels and realistic copy. It MUST work on every device: design mobile-first (works from 320px phones to wide desktops using sm:/md:/lg: classes), no horizontal scrolling, wrapping/stacking layouts, tap targets at least 44px, inputs with text-base (16px) so phones do not zoom, 100dvh instead of 100vh for full-screen areas, and both touch and mouse/keyboard input. Wrap every localStorage/sessionStorage access in try/catch (it can be blocked) and never let a storage error crash the page. Include loading, empty and error states and working forms with validation.
- Navigate between pages with next/link and useRouter from next/navigation.
- The backend may not be running when this is previewed: wrap every fetch in try/catch and, on failure, fall back to realistic in-memory demo data so every page is usable and interactive. Keep the real API calls in lib/api.ts.
- The code must compile without TypeScript or JSX errors.

${FILE_FORMAT}${tracking ? FRONTEND_TRACKING_ADDENDUM : ""}${healthcare ? FRONTEND_HEALTH_ADDENDUM(tracking) : ""}

SRS:
${srs}`;

export const backendPrompt = (srs: string, tracking = false, healthcare = false) => `You are Agent 3, a senior backend engineer. Using ONLY the SRS below, build the WHOLE backend as Next.js 15 App Router route handlers with TypeScript and Prisma.

Deliver:
- app/api/<resource>/route.ts (GET list and POST create) and app/api/<resource>/[id]/route.ts (GET one, PATCH, DELETE) for every resource in SRS section 6, with EXACTLY the paths, methods, request and response JSON from the contract.
- lib/validators.ts : zod schemas for every request body.
- If the SRS needs login: app/api/auth/register/route.ts, app/api/auth/login/route.ts, app/api/auth/logout/route.ts and lib/session.ts. Use the "jose" package for a signed JWT stored in an httpOnly, sameSite=lax cookie (secret from process.env.SESSION_SECRET) and "bcryptjs" for password hashing. lib/session.ts exports getCurrentUser(req: Request): Promise<{ id: string; email: string } | null>.

Rules:
- Import Prisma ONLY as: import { db } from "@/lib/db";  (it exports a ready PrismaClient called db; do not create lib/db.ts).
- Prisma model and field names must match SRS section 5 exactly (another agent writes the schema from that same section).
- Allowed packages ONLY: next, zod, @prisma/client, jose, bcryptjs.
- Validate every input with zod and return clear JSON errors { "error": "..." } with correct status codes (400, 401, 403, 404, 409, 500).
- Protect routes that the SRS marks as requiring auth, and scope data to the logged-in user so one user can never read or change another user's records.
- Never expose passwordHash. Wrap handlers in try/catch. Use the Next.js 15 signature for dynamic routes: { params }: { params: Promise<{ id: string }> } and await params.
- The code must compile without TypeScript errors.

${FILE_FORMAT}${tracking ? BACKEND_TRACKING_ADDENDUM : ""}${healthcare ? BACKEND_HEALTH_ADDENDUM(tracking) : ""}

SRS:
${srs}`;

export const databasePrompt = (srs: string, tracking = false, healthcare = false) => `You are Agent 4, a senior database architect. Using ONLY section 5 (Data Model) of the SRS below, write the complete Prisma schema (prisma/schema.prisma) for PostgreSQL.

Rules:
- Include: generator client { provider = "prisma-client-js" } and datasource db { provider = "postgresql"  url = env("DATABASE_URL") }.
- Model and field names EXACTLY as in the SRS (the backend code uses them).
- Every model: id String @id @default(cuid()), createdAt DateTime @default(now()), updatedAt DateTime @updatedAt (unless the SRS says otherwise).
- Proper relations with onDelete behaviour, @@index on foreign keys and common filters, @unique where the SRS requires it, and enums for fixed value sets.
- Return ONLY the schema code, no fences, no explanation.${tracking ? DATABASE_TRACKING_ADDENDUM : ""}${healthcare ? DATABASE_HEALTH_ADDENDUM : ""}

SRS:
${srs}`;

export const qaPrompt = (srs: string, frontend: string, backend: string, schema: string, tracking = false, healthcare = false) => `You are Agent 5, a senior security and QA engineer. Review the REAL generated code below against the SRS and write a Markdown report.

Sections:
# QA & Security Report
## 1. Verdict  (one line: Ready / Needs fixes, plus a score out of 10)
## 2. Contract check  (table: frontend call or page -> backend route -> schema field -> OK / MISMATCH, with the exact file names. List every mismatch you find.)
## 3. Bugs & missing pieces  (concrete issues with file name and the fix)
## 4. Security review  (auth and authorization on each route, input validation, data isolation between users, secret handling, password and cookie handling, injection and XSS risks. Cite files.)
## 5. Fixes to apply first  (prioritised checklist)
## 6. Deployment checklist for Vercel  (env vars such as DATABASE_URL and SESSION_SECRET, prisma db push, build command, post-deploy smoke tests)

Be specific and honest: only report what is actually in the code, and say so if something is fine. Do not invent files.${tracking ? QA_TRACKING_ADDENDUM : ""}${healthcare ? QA_HEALTH_ADDENDUM : ""}

SRS:
${srs}

FRONTEND FILES:
${frontend}

BACKEND FILES:
${backend}

PRISMA SCHEMA:
${schema}`;

// Pseudocode & Flowchart: turns the finished build into pseudocode + flowcharts (Mermaid), so the person
// can understand (and explain) how the app works without reading all the code.
export const flowPrompt = (srs: string, frontendFiles: string[], backendFiles: string[]) => `You are a senior software architect who explains systems to beginners. Using the SRS and the file list below, write the PSEUDOCODE and FLOWCHARTS of the finished app.

Return Markdown with exactly these sections, in this order:
# Pseudocode & Flowcharts: <app name>
## 1. System Flowchart
One short sentence, then ONE mermaid block showing how the pieces connect (User -> pages -> API routes -> database, plus login if the app has it).
## 2. User Journey Flowchart
One short sentence, then ONE mermaid block for the main thing a user does from opening the app to finishing the task, including decision points (Yes/No) and error paths.
## 3. Feature Flowcharts
For the 2 to 4 most important features from the SRS: a "### <feature>" heading, then ONE mermaid block each.
## 4. Pseudocode
For the same features and for login (if any): a "### <feature>" heading, then a plain-text code block (use \`\`\`text) of numbered, indented pseudocode. Use words like FUNCTION, IF / ELSE, FOR EACH, RETURN, VALIDATE, SAVE, FETCH. Mention the real API paths and entity names from the SRS.
## 5. Data Flow
A short bullet list: where each important piece of data is created, stored, read, changed and deleted.

MERMAID RULES (the diagram must render without errors):
- Start each block with \`\`\`mermaid and a first line of "flowchart TD".
- Node ids are simple letters/numbers only (A, B1, C2). Put EVERY label in double quotes, for example A["Open the app"].
- Decisions use curly braces with quotes: B{"Logged in?"}. Edge labels look like A -->|"Yes"| B.
- No parentheses, brackets or quotes inside a label, no HTML, no semicolons, no "end" as a label, no styling or classDef lines.
- Maximum 14 nodes per diagram so it stays readable.

Be specific to THIS app, not generic. Keep the whole answer under about 1,800 words. Return only the Markdown.

FRONTEND FILES: ${frontendFiles.join(", ") || "(none)"}
BACKEND FILES: ${backendFiles.join(", ") || "(none)"}

SRS:
${srs}`;

export const customizeHint = (agent: string): string => {
  if (agent === "frontend" || agent === "backend") {
    return `This module is a set of files in the format "=== FILE: path ===". Return ALL files (changed and unchanged) in the same format, nothing else. Keep names and API paths consistent with the SRS contracts. Allowed imports stay the same.`;
  }
  if (agent === "flow") {
    return `This is Markdown with mermaid flowcharts and plain-text pseudocode. Return the COMPLETE updated Markdown. Keep each mermaid block valid: it starts with "flowchart TD", every node label is in double quotes, no parentheses inside labels, at most 14 nodes per diagram.`;
  }
  if (agent === "spec") {
    return `This is an SRS. Keep its section structure. If you change section 5, 6 or 7, keep names consistent because other agents depend on them.`;
  }
  return "";
};