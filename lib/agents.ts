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


// The "master mind" every agent follows: think like a whole product team first, then build in a fixed page order.
const MASTERMIND = `
MASTER MIND (think before you write): act as a product strategist, UX designer, senior full-stack engineer and security engineer at once. Before producing anything, work out silently: who uses this product (visitor, user, admin, and any other role the idea needs such as seller, doctor, teacher or driver), what each of them must be able to do from first visit to daily use, every screen those journeys need, and which data and API call powers each screen. Then build ONE consistent product. Do not skip a page because it seems obvious, and do not stop at the first working screen.

PAGE ORDER (build and list pages in exactly this order; the home page is always first):
1. HOME "/" : the most polished page. Navbar, hero with a clear promise and call to action, key features, how it works, proof/benefits, pricing or plans when relevant, FAQ, final call to action and footer. Buttons go to /register and /login.
2. USER AUTH: /login, /register, /forgot-password, /reset-password (each with validation, loading state and clear errors).
3. ADMIN LOGIN: /admin/login, a separate branded page only for administrators (it posts to /api/auth/admin-login; a non-admin account gets "This account is not an administrator"; success goes to /admin).
4. USER AREA: /dashboard, then /profile and /settings (edit name, change password, log out). Add role-specific dashboards when the idea has more roles.
5. FEATURE PAGES of the idea: list, detail, create, edit and delete flows for every main resource, plus search/filter where it fits (for example products, cart, checkout and orders for a shop; appointments for a clinic; courses and lessons for a school).
6. ADMIN AREA: /admin (real stats), /admin/users (search, change role, block/unblock) and a management page for every main resource. Everything under /admin requires role ADMIN.
7. SUPPORT PAGES: /about, /contact (saves messages to the database), /privacy, /terms.
8. SYSTEM: app/not-found.tsx and an error state for failed requests.
`;

// Appended to the contract, SRS, frontend, backend and database prompts: the site must be COMPLETE and fully dynamic.
const COMPLETE_SITE = `${MASTERMIND}
COMPLETE SITE REQUIREMENT (most important rule): the result must be a FINISHED, production-style website, not a demo. After the owner sets .env (DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL) and runs "npx prisma db push" and "npm run db:seed", EVERY page works with real data from the database. It must include ALL of the pages above, adapted to the idea, plus:
- Auth: working register, login, admin login, logout, forgot/reset password (token stored in the database), and redirect to /login (or /admin/login for admin pages) when a protected page is opened without a session.
- Roles: the User entity has role (USER or ADMIN). Admin pages and /api/admin/** check role === "ADMIN" on the server, never only in the browser. The first user who registers with the email in process.env.ADMIN_EMAIL becomes ADMIN, and the seed script creates that admin too.
- Shared: navbar that changes when logged in (and shows an Admin link to admins), footer, loading/empty/error states and a clear error message for every failed request.
- Nothing is hardcoded: lists, counts, charts and profile data all come from the API and database.
`;

// Step 1 of Agent 1 (about 15 to 20 seconds): ONLY the three binding sections. Agents 2, 3 and 4 start from this
// immediately, while the full SRS (srsPrompt) is written at the same time.
export const contractPrompt = (idea: string, tracking = false, healthcare = false) => `You are Agent 1, a senior business analyst. For this web app idea:
"${idea}"
write ONLY the binding contract of its Software Requirements Specification, as Markdown. Other engineers start building the frontend, the API and the database from your text at once, so every name must be precise and consistent. Use exactly these headings, in this order:
# Contract: <app name>
## 5. Data Model  (BINDING CONTRACT. For every entity a table: field | type | constraints. Use camelCase fields and PascalCase entity names. Include id, createdAt, updatedAt and relations. If users must log in, the User entity includes email (unique) and passwordHash.)
## 6. API Contract  (BINDING CONTRACT. A table per resource: method | path | auth required | request JSON | success JSON | error cases. Paths under /api/..., consistent names that match section 5.)
## 7. Pages & UI Flows  (BINDING CONTRACT. For every page: route | purpose | main components | API endpoints it calls. List EVERY page in the PAGE ORDER given below (home "/" first, then /login, /register, /forgot-password, /reset-password, /admin/login, /dashboard, /profile, /settings, every feature page, admin pages, support pages). The User entity always has email (unique), passwordHash, name, role (USER/ADMIN) and a PasswordReset entity (token, userId, expiresAt). Section 6 always includes /api/auth/register, /api/auth/login, /api/auth/admin-login, /api/auth/logout, /api/auth/me, /api/auth/forgot-password, /api/auth/reset-password, /api/profile and admin endpoints.)

Rules: be specific and realistic for THIS idea, no placeholders, no filler, no other sections. Think carefully and cover every screen and data field. Keep it under about 1,800 words. Return only the Markdown.${COMPLETE_SITE}${tracking ? SRS_TRACKING_ADDENDUM : ""}${healthcare ? SRS_HEALTH_ADDENDUM(tracking) : ""}`;

export const srsPrompt = (idea: string, tracking = false, healthcare = false, contract = "") => `You are Agent 1, a senior business analyst. Write a complete Software Requirements Specification (SRS) in Markdown, in the style of IEEE 830, for this web app idea:
"${idea}"

Use exactly these sections, in this order:
# Software Requirements Specification: <app name>
## 1. Introduction  (1.1 Purpose, 1.2 Scope, 1.3 Definitions)
## 2. Overall Description  (2.1 User roles: Visitor, User, Admin and every other role the idea needs, with what each can do, 2.2 Assumptions & constraints, 2.3 Tech stack: Next.js 15 App Router, TypeScript, Tailwind CSS, Prisma + PostgreSQL)
## 3. Functional Requirements  (numbered FR-01, FR-02, ... each with a priority [Must/Should/Could] and 1-3 acceptance criteria)
## 4. Non-Functional Requirements  (performance, security, accessibility, responsiveness)
## 5. Data Model  (BINDING CONTRACT. For every entity a table: field | type | constraints. Use camelCase fields and PascalCase entity names. Include id, createdAt, updatedAt and relations. If users must log in, the User entity includes email (unique) and passwordHash.)
## 6. API Contract  (BINDING CONTRACT. A table per resource: method | path | auth required | request JSON | success JSON | error cases. Paths under /api/..., consistent names that match section 5.)
## 7. Pages & UI Flows  (BINDING CONTRACT. For every page: route | purpose | main components | API endpoints it calls. List EVERY page in the PAGE ORDER given below (home "/" first, then user login/register/forgot/reset, /admin/login, dashboard, profile, settings, every feature page, admin pages, support pages).)
## 8. Out of Scope

Rules: be specific and realistic for THIS idea, no placeholders, no filler. Sections 5, 6 and 7 will be used verbatim by other engineers, so every name must be precise and consistent. Keep the whole document under about 3,500 words. Return only the Markdown.${COMPLETE_SITE}${tracking ? SRS_TRACKING_ADDENDUM : ""}${healthcare ? SRS_HEALTH_ADDENDUM(tracking) : ""}${contract ? `\n\nSECTIONS 5, 6 AND 7 ARE ALREADY FIXED: the frontend, API and database are being built from them right now. Reproduce the contract below VERBATIM as sections 5, 6 and 7 (do not rename or change anything in it), and write sections 1 to 4 and 8 so that they agree with it.\n\nCONTRACT:\n${contract}` : ""}`;

// compact = a smaller answer that fits a short time budget (Live Preview builds, or Vercel Hobby's 300 second limit).
const FRONTEND_SIZE_FULL = `Build EVERY page in SRS section 7 (typically 20 to 35 files) in the PAGE ORDER above: home first, then /login, /register, /forgot-password, /reset-password, /admin/login, dashboard, profile, settings, feature pages, admin pages, support pages, not-found, plus shared components. Output the files in that same order, so app/page.tsx is the FIRST file. Complete and working, never stubs, never "coming soon".`;
const FRONTEND_SIZE_COMPACT = `Aim for 8 to 10 files in total, complete and working, not stubs, output in this order: app/page.tsx (the home page, always first), app/login/page.tsx, app/register/page.tsx, app/admin/login/page.tsx, app/dashboard/page.tsx, then at most 2 more pages, 1 to 2 small shared components, lib/types.ts and lib/api.ts. If SRS section 7 lists more pages, fold the secondary ones into tabs or sections of the pages you build, so every feature stays reachable. Keep every file under about 150 lines: dense Tailwind classes, no long comments, no repeated markup (map over arrays), no decorative extras. A SHORT answer is required: it must finish quickly.`;
// The full frontend is too much for ONE AI call (it timed out after 20+ minutes). So a full-size build writes it as
// 3 PARTS IN PARALLEL. The parts only share a tiny fixed set of files whose exact shape is defined here, so they agree.
export const FRONTEND_PARTS = 3;
const SHARED_FILES = `SHARED FILES (written by engineer 1 with EXACTLY this shape; engineers 2 and 3 import them and must not rewrite them):
- lib/api.ts exports ONLY: export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T>  (fetch with credentials "include" and JSON headers; parses JSON; on a non-OK response throws new Error(data.error || "Request failed")).
- components/Navbar.tsx : default export Navbar with NO props (it loads /api/auth/me itself; shows Login/Register, or Dashboard/Logout, and an Admin link when role is ADMIN).
- components/Footer.tsx : default export Footer with NO props.`;
const FRONTEND_PART_SCOPE = [
  `YOUR SCOPE (engineer 1 of 3, foundation + public + auth). Two other engineers write the rest at the same time, do NOT write their files:
${SHARED_FILES}
Write these files, in this order: app/page.tsx (HOME, first), lib/api.ts, lib/types.ts (types for SRS section 5), components/Navbar.tsx, components/Footer.tsx, app/login/page.tsx, app/register/page.tsx, app/forgot-password/page.tsx, app/reset-password/page.tsx, app/admin/login/page.tsx, app/about/page.tsx, app/contact/page.tsx, app/privacy/page.tsx, app/terms/page.tsx, app/not-found.tsx, plus your own small components under components/ (not components/app or components/admin). Home must be the richest page.`,
  `YOUR SCOPE (engineer 2 of 3, signed-in user area + the idea's feature pages). Two other engineers write the rest at the same time, do NOT write their files:
${SHARED_FILES}
Import Navbar, Footer and api from those shared files; do NOT write them. Write: app/dashboard/page.tsx, app/profile/page.tsx, app/settings/page.tsx and EVERY feature page of the idea (list, detail, create, edit and delete flows for each main resource, with search or filters where it fits), your own components ONLY under components/app/, and your own types in lib/types-app.ts. Do not write app/page.tsx, auth pages, admin pages, lib/api.ts or lib/types.ts.`,
  `YOUR SCOPE (engineer 3 of 3, administrator area). Two other engineers write the rest at the same time, do NOT write their files:
${SHARED_FILES}
Import Navbar and api from those shared files; do NOT write them. Write: components/admin/AdminShell.tsx (wraps every admin page: calls /api/auth/me, redirects to /admin/login when not signed in and to /dashboard when the role is not ADMIN, shows a sidebar with links to every admin page), app/admin/page.tsx (real stats and recent activity), app/admin/users/page.tsx (search, change role, block/unblock), one app/admin/<resource>/page.tsx management page for EVERY main resource of the idea (list, search, create, edit, delete, status changes), further components ONLY under components/admin/, and your own types in lib/types-admin.ts. Do not write app/admin/login/page.tsx, public, user or auth pages, lib/api.ts or lib/types.ts.`,
];

export const frontendPrompt = (srs: string, tracking = false, healthcare = false, compact = false, part?: number) => `You are Agent 2, a senior frontend engineer. Using ONLY the SRS below, build ${part === undefined ? "the WHOLE frontend" : "your part of the frontend"} as a multi-page Next.js 15 App Router + TypeScript + Tailwind CSS app.

${
  part !== undefined
    ? FRONTEND_PART_SCOPE[part]
    : `Deliver:
- app/page.tsx : the HOME page ("/"), written FIRST. After it come the login and register pages, then /admin/login, then the rest in the PAGE ORDER above.
- one app/<route>/page.tsx for every other page in SRS section 7 (dynamic routes like app/tasks/[id]/page.tsx are fine).
- components/*.tsx : reusable components (navbar, cards, forms, modals, empty/loading/error states).
- lib/types.ts : TypeScript types matching SRS section 5.
- lib/api.ts : small typed fetch helpers that call EXACTLY the paths, methods and JSON shapes from SRS section 6.
${compact ? FRONTEND_SIZE_COMPACT : FRONTEND_SIZE_FULL}`
}

Rules:
- Every file using hooks, state or events starts with "use client";.
- Allowed imports ONLY: react, next/link, next/navigation, lucide-react, and your own files via "@/..." (for example "@/components/Navbar"). No other packages.
- Modern, responsive dark UI with Tailwind classes, real labels and realistic copy. It MUST work on every device: design mobile-first (works from 320px phones to wide desktops using sm:/md:/lg: classes), no horizontal scrolling, wrapping/stacking layouts, tap targets at least 44px, inputs with text-base (16px) so phones do not zoom, 100dvh instead of 100vh for full-screen areas, and both touch and mouse/keyboard input. Wrap every localStorage/sessionStorage access in try/catch (it can be blocked) and never let a storage error crash the page. Include loading, empty and error states and working forms with validation.
- Navigate between pages with next/link and useRouter from next/navigation.
- Real data first: every page loads and saves through the real API in lib/api.ts (credentials: "include"), shows the server's error messages, and uses the logged-in user from /api/auth/me. Only when the request itself fails because no server is reachable (Live Preview) may you fall back to realistic in-memory demo data; never hardcode data that the API returns.
- Protected pages call /api/auth/me and redirect to /login when it returns 401; admin pages redirect non-admins to /dashboard. Login and register forms validate, show errors, then go to /dashboard.
- The code must compile without TypeScript or JSX errors.

${COMPLETE_SITE}
${FILE_FORMAT}${tracking ? FRONTEND_TRACKING_ADDENDUM : ""}${healthcare ? FRONTEND_HEALTH_ADDENDUM(tracking) : ""}

SRS:
${srs}`;

export const backendPrompt = (srs: string, tracking = false, healthcare = false) => `You are Agent 3, a senior backend engineer. Using ONLY the SRS below, build the WHOLE backend as Next.js 15 App Router route handlers with TypeScript and Prisma.

Deliver:
- app/api/<resource>/route.ts (GET list and POST create) and app/api/<resource>/[id]/route.ts (GET one, PATCH, DELETE) for every resource in SRS section 6, with EXACTLY the paths, methods, request and response JSON from the contract.
- lib/validators.ts : zod schemas for every request body.
- Auth is ALWAYS included: app/api/auth/register/route.ts, login, admin-login (same cookie as login, but only accepts users whose role is ADMIN and returns a generic 401 otherwise), logout, me (GET current user), forgot-password (creates a PasswordReset token and logs the reset link to the server console when no email provider is configured), reset-password, app/api/profile/route.ts (GET, PATCH name, change password) and lib/session.ts. Add requireAdmin(req) in lib/session.ts and admin routes under app/api/admin/**. Use the "jose" package for a signed JWT stored in an httpOnly, sameSite=lax cookie (secret from process.env.SESSION_SECRET) and "bcryptjs" for password hashing. lib/session.ts exports getCurrentUser(req: Request): Promise<{ id: string; email: string } | null>.

Rules:
- Import Prisma ONLY as: import { db } from "@/lib/db";  (it exports a ready PrismaClient called db; do not create lib/db.ts).
- Prisma model and field names must match SRS section 5 exactly (another agent writes the schema from that same section).
- Allowed packages ONLY: next, zod, @prisma/client, jose, bcryptjs.
- Validate every input with zod and return clear JSON errors { "error": "..." } with correct status codes (400, 401, 403, 404, 409, 500).
- Protect routes that the SRS marks as requiring auth, and scope data to the logged-in user so one user can never read or change another user's records.
- Never expose passwordHash. Wrap handlers in try/catch. Use the Next.js 15 signature for dynamic routes: { params }: { params: Promise<{ id: string }> } and await params.
- The code must compile without TypeScript errors.

- Every route returns real database data (no mock responses). On register, if the email equals process.env.ADMIN_EMAIL set role "ADMIN". Use SESSION_SECRET from process.env and throw a clear error if it is missing.

${COMPLETE_SITE}
${FILE_FORMAT}${tracking ? BACKEND_TRACKING_ADDENDUM : ""}${healthcare ? BACKEND_HEALTH_ADDENDUM(tracking) : ""}

SRS:
${srs}`;

export const databasePrompt = (srs: string, tracking = false, healthcare = false) => `You are Agent 4, a senior database architect. Using ONLY section 5 (Data Model) of the SRS below, write the complete Prisma schema (prisma/schema.prisma) for PostgreSQL.

Rules:
- Include: generator client { provider = "prisma-client-js" } and datasource db { provider = "postgresql"  url = env("DATABASE_URL") }.
- Model and field names EXACTLY as in the SRS (the backend code uses them).
- Every model: id String @id @default(cuid()), createdAt DateTime @default(now()), updatedAt DateTime @updatedAt (unless the SRS says otherwise).
- Proper relations with onDelete behaviour, @@index on foreign keys and common filters, @unique where the SRS requires it, and enums for fixed value sets.
- Always include User (email unique, passwordHash, name, role enum USER/ADMIN default USER, blockedAt optional) and PasswordReset (token unique, userId, expiresAt, usedAt) even if the SRS data model is short.
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