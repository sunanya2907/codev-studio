// Quick structural checks on what each agent returned. If an answer fails them, the build
// asks that agent once more (with the problems listed) before giving up.
import { parseFiles } from "@/lib/files";

export function validateSrs(text: string): string[] {
  const issues: string[] = [];
  if (text.trim().length < 800) issues.push("The SRS is far too short to be a real specification.");
  for (const n of [3, 5, 6, 7]) {
    if (!new RegExp(`^#{1,3}\\s*${n}[.\\s]`, "m").test(text)) {
      issues.push(`The SRS is missing section ${n} (use the exact section headings requested).`);
    }
  }
  if (!/\/api\//.test(text)) issues.push("The API contract (section 6) lists no /api/... endpoints.");
  return issues;
}

export function validateFrontend(blob: string): string[] {
  const issues: string[] = [];
  const files = parseFiles(blob, "app/page.tsx");
  if (files.length === 0) return ["No files were returned."];
  if (!files.some((f) => /(^|\/)app\/page\.(tsx|jsx)$/.test(f.path))) {
    issues.push("There is no app/page.tsx (the home page).");
  }
  for (const f of files.filter((f) => /\/?page\.(tsx|jsx)$/.test(f.path))) {
    if (!/export\s+default/.test(f.content)) issues.push(`${f.path} has no default export.`);
  }
  for (const f of files.filter((f) => /\.(tsx|jsx)$/.test(f.path))) {
    if (!/[<>]/.test(f.content)) issues.push(`${f.path} contains no JSX.`);
  }
  return issues;
}

export function validateBackend(blob: string): string[] {
  const files = parseFiles(blob, "app/api/route.ts");
  if (files.length === 0) return ["No files were returned."];
  const routes = files.filter((f) => /(^|\/)route\.ts$/.test(f.path));
  if (routes.length === 0) return ["No app/api/**/route.ts files were returned."];
  const issues: string[] = [];
  for (const r of routes) {
    if (!/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(r.content)) {
      issues.push(`${r.path} exports no HTTP handler (GET/POST/PATCH/DELETE).`);
    }
  }
  return issues;
}

export function validateSchema(text: string): string[] {
  const issues: string[] = [];
  if (!/\bdatasource\s+db\b/.test(text)) issues.push("The schema has no datasource block.");
  if (!/\bgenerator\s+client\b/.test(text)) issues.push("The schema has no generator block.");
  const models = [...text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  if (models.length === 0) issues.push("The schema defines no models.");
  for (const m of models) {
    if (!/@id\b|@@id\b/.test(m[2])) issues.push(`Model ${m[1]} has no @id.`);
  }
  const open = (text.match(/\{/g) || []).length;
  const close = (text.match(/\}/g) || []).length;
  if (open !== close) issues.push("The schema has unbalanced braces (it looks cut off).");
  return issues;
}
