// Prompts for the 5 agents. Agent 1's SRS contains two BINDING contracts (data model and
// API contract). Agents 2, 3 and 4 all read them, so the frontend, the API and the
// database agree on names and shapes even though they run in parallel.

const FILE_FORMAT = `OUTPUT FORMAT (strict): return every file as
=== FILE: <relative/path.ext> ===
<complete file contents>
Start each file with that exact marker line on its own line. No markdown fences, no explanations, nothing before the first marker.`;

export const srsPrompt = (idea: string) => `You are Agent 1, a senior business analyst. Write a complete Software Requirements Specification (SRS) in Markdown, in the style of IEEE 830, for this web app idea:
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

Rules: be specific and realistic for THIS idea, no placeholders, no filler. Sections 5, 6 and 7 will be used verbatim by other engineers, so every name must be precise and consistent. Keep the whole document under about 2,500 words. Return only the Markdown.`;

export const frontendPrompt = (srs: string) => `You are Agent 2, a senior frontend engineer. Using ONLY the SRS below, build the WHOLE frontend as a multi-page Next.js 15 App Router + TypeScript + Tailwind CSS app.

Deliver:
- app/page.tsx : the main landing/dashboard page ("/").
- one app/<route>/page.tsx for every other page in SRS section 7 (dynamic routes like app/tasks/[id]/page.tsx are fine).
- components/*.tsx : reusable components (navbar, cards, forms, modals, empty/loading/error states).
- lib/types.ts : TypeScript types matching SRS section 5.
- lib/api.ts : small typed fetch helpers that call EXACTLY the paths, methods and JSON shapes from SRS section 6.
Aim for roughly 6 to 12 files, complete and working, not stubs.

Rules:
- Every file using hooks, state or events starts with "use client";.
- Allowed imports ONLY: react, next/link, next/navigation, lucide-react, and your own files via "@/..." (for example "@/components/Navbar"). No other packages.
- Modern, responsive dark UI with Tailwind classes, real labels and realistic copy. Include loading, empty and error states and working forms with validation.
- Navigate between pages with next/link and useRouter from next/navigation.
- The backend may not be running when this is previewed: wrap every fetch in try/catch and, on failure, fall back to realistic in-memory demo data so every page is usable and interactive. Keep the real API calls in lib/api.ts.
- The code must compile without TypeScript or JSX errors.

${FILE_FORMAT}

SRS:
${srs}`;

export const backendPrompt = (srs: string) => `You are Agent 3, a senior backend engineer. Using ONLY the SRS below, build the WHOLE backend as Next.js 15 App Router route handlers with TypeScript and Prisma.

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

${FILE_FORMAT}

SRS:
${srs}`;

export const databasePrompt = (srs: string) => `You are Agent 4, a senior database architect. Using ONLY section 5 (Data Model) of the SRS below, write the complete Prisma schema (prisma/schema.prisma) for PostgreSQL.

Rules:
- Include: generator client { provider = "prisma-client-js" } and datasource db { provider = "postgresql"  url = env("DATABASE_URL") }.
- Model and field names EXACTLY as in the SRS (the backend code uses them).
- Every model: id String @id @default(cuid()), createdAt DateTime @default(now()), updatedAt DateTime @updatedAt (unless the SRS says otherwise).
- Proper relations with onDelete behaviour, @@index on foreign keys and common filters, @unique where the SRS requires it, and enums for fixed value sets.
- Return ONLY the schema code, no fences, no explanation.

SRS:
${srs}`;

export const qaPrompt = (srs: string, frontend: string, backend: string, schema: string) => `You are Agent 5, a senior security and QA engineer. Review the REAL generated code below against the SRS and write a Markdown report.

Sections:
# QA & Security Report
## 1. Verdict  (one line: Ready / Needs fixes, plus a score out of 10)
## 2. Contract check  (table: frontend call or page -> backend route -> schema field -> OK / MISMATCH, with the exact file names. List every mismatch you find.)
## 3. Bugs & missing pieces  (concrete issues with file name and the fix)
## 4. Security review  (auth and authorization on each route, input validation, data isolation between users, secret handling, password and cookie handling, injection and XSS risks. Cite files.)
## 5. Fixes to apply first  (prioritised checklist)
## 6. Deployment checklist for Vercel  (env vars such as DATABASE_URL and SESSION_SECRET, prisma db push, build command, post-deploy smoke tests)

Be specific and honest: only report what is actually in the code, and say so if something is fine. Do not invent files.

SRS:
${srs}

FRONTEND FILES:
${frontend}

BACKEND FILES:
${backend}

PRISMA SCHEMA:
${schema}`;

export const customizeHint = (agent: string): string => {
  if (agent === "frontend" || agent === "backend") {
    return `This module is a set of files in the format "=== FILE: path ===". Return ALL files (changed and unchanged) in the same format, nothing else. Keep names and API paths consistent with the SRS contracts. Allowed imports stay the same.`;
  }
  if (agent === "spec") {
    return `This is an SRS. Keep its section structure. If you change section 5, 6 or 7, keep names consistent because other agents depend on them.`;
  }
  return "";
};
