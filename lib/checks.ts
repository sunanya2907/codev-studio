import "server-only";
// Deterministic cross-checks between the SRS, the frontend, the backend and the schema.
// These run in plain code (not AI), so their findings are facts. They are appended to the
// QA report that Agent 5 writes.
import { parseFiles } from "@/lib/files";

const norm = (p: string) =>
  "/" +
  p
    .replace(/\?.*$/, "")
    .split("/")
    .filter(Boolean)
    .map((seg) => (/^(\[.+\]|\{.+\}|:.+|\$\{.+\})$/.test(seg) ? "[x]" : seg.toLowerCase()))
    .join("/");

/** app/api/tasks/[id]/route.ts -> /api/tasks/[x] */
function routeFromFile(path: string): string | null {
  const m = path.match(/(?:^|\/)app(\/api(?:\/.*)?)\/route\.ts$/);
  return m ? norm(m[1]) : m === null && /(?:^|\/)app\/api\/route\.ts$/.test(path) ? "/api" : null;
}

const uniq = <T,>(a: T[]) => [...new Set(a)];

export type CheckReport = { markdown: string; problems: number };

export function runStaticChecks(spec: string, frontend: string, backend: string, schema: string): CheckReport {
  const lines: string[] = [];
  let problems = 0;
  const bad = (s: string) => {
    problems++;
    lines.push(`- ❌ ${s}`);
  };
  const ok = (s: string) => lines.push(`- ✅ ${s}`);

  const backendFiles = parseFiles(backend, "app/api/route.ts");
  const frontendFiles = parseFiles(frontend, "app/page.tsx");
  const routes = uniq(backendFiles.map((f) => routeFromFile(f.path)).filter((r): r is string => !!r));

  // 1) every endpoint promised in the SRS has a route file
  const promised = uniq([...spec.matchAll(/(\/api\/[A-Za-z0-9_\-/[\]{}:]+)/g)].map((m) => norm(m[1])));
  const missing = promised.filter((p) => !routes.includes(p));
  if (promised.length === 0) bad("The SRS does not list any /api/ endpoints.");
  else if (missing.length) bad(`SRS endpoints with no backend route file: ${missing.join(", ")}`);
  else ok(`All ${promised.length} endpoints in the SRS have a backend route file.`);

  // 2) every API call in the frontend hits a real route
  const calls = uniq(
    frontendFiles.flatMap((f) =>
      [...f.content.matchAll(/["'`](\/api\/[A-Za-z0-9_\-/${}.[\]]*)/g)].map((m) => norm(m[1]))
    )
  );
  const unknownCalls = calls.filter((c) => !routes.includes(c));
  if (calls.length === 0) lines.push("- ⚠️ The frontend never calls the API (it may only use demo data).");
  else if (unknownCalls.length) bad(`Frontend calls routes that do not exist: ${unknownCalls.join(", ")}`);
  else ok(`All ${calls.length} API paths used by the frontend exist in the backend.`);

  // 3) the backend only uses Prisma models that the schema defines
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
  const accessors = models.map((m) => m.charAt(0).toLowerCase() + m.slice(1));
  const used = uniq(backendFiles.flatMap((f) => [...f.content.matchAll(/\bdb\.(\w+)\.(?:find|create|update|delete|upsert|count|aggregate|group)/g)].map((m) => m[1])));
  const unknownModels = used.filter((u) => !accessors.includes(u));
  if (models.length === 0) bad("The schema defines no models.");
  else if (unknownModels.length) bad(`Backend uses Prisma models missing from the schema: ${unknownModels.join(", ")}`);
  else ok(`Backend only uses models that exist in the schema (${used.length} used of ${models.length} defined).`);

  // 4) simple safety checks
  const allCode = [...frontendFiles, ...backendFiles].map((f) => f.content).join("\n");
  if (/(sk_(live|test)_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(allCode)) {
    bad("A secret or API key appears to be written directly in the code.");
  } else ok("No API keys or private keys are written in the code.");
  const unprotected = backendFiles.filter(
    (f) => /(^|\/)route\.ts$/.test(f.path) && /export\s+(async\s+)?function\s+(POST|PATCH|PUT|DELETE)/.test(f.content) &&
      !/getCurrentUser|auth\(|getServerSession|session/i.test(f.content) && !/\/auth\//.test(f.path)
  );
  if (/getCurrentUser/.test(allCode) && unprotected.length) {
    bad(`Routes that change data without checking the user: ${unprotected.map((f) => f.path).join(", ")}`);
  } else if (unprotected.length) lines.push(`- ⚠️ ${unprotected.length} write route(s) have no login check. Fine only if the app is meant to be public.`);
  else ok("Every route that changes data checks who is logged in.");

  const markdown =
    `\n\n---\n## Automated checks (run by Build_Core in code, not by AI)\n` +
    (problems === 0 ? "No contract or safety problems were found.\n\n" : `${problems} problem(s) found:\n\n`) +
    lines.join("\n") +
    "\n";
  return { markdown, problems };
}
