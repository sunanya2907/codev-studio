// Agents 2 and 3 return MANY files in one text blob, in this format:
//
//   === FILE: app/page.tsx ===
//   <code>
//   === FILE: components/Header.tsx ===
//   <code>
//
// The same helpers are used by the server (to normalise model output), the preview
// (to run a multi-page app) and the ZIP export (to write real files).

export type GenFile = { path: string; content: string };

const MARKER = /^=== FILE: (.+?) ===[ \t]*$/;

/** Safe relative path, or null if it is empty / tries to escape the project. */
export function cleanPath(p: string): string | null {
  const s = p.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "");
  if (!s) return null;
  if (s.split("/").some((seg) => seg === ".." || seg === "")) return null;
  return s;
}

function stripFence(code: string): string {
  let t = code.trim();
  const m = t.match(/^```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/);
  if (m) return m[1].trim();
  // Stray closing fence left over from a wrapper around the whole answer.
  if (t.endsWith("```") && (t.match(/```/g) || []).length === 1) {
    t = t.slice(0, -3).trim();
  }
  return t;
}

export function parseFiles(text: string, defaultPath: string): GenFile[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const files: GenFile[] = [];
  let cur: { path: string; buf: string[] } | null = null;

  const flush = () => {
    if (!cur) return;
    const content = stripFence(cur.buf.join("\n"));
    if (content) files.push({ path: cur.path, content });
    cur = null;
  };

  for (const line of lines) {
    const m = line.match(MARKER);
    if (m) {
      flush();
      const path = cleanPath(m[1]);
      cur = path ? { path, buf: [] } : null;
      continue;
    }
    if (cur) cur.buf.push(line);
  }
  flush();

  if (files.length === 0) {
    const content = stripFence(text);
    return content ? [{ path: defaultPath, content }] : [];
  }
  // Later duplicates of a path win (model repeated a file).
  const map = new Map<string, GenFile>();
  for (const f of files) map.set(f.path, f);
  return [...map.values()];
}

export function serializeFiles(files: GenFile[]): string {
  return files.map((f) => `=== FILE: ${f.path} ===\n${f.content}`).join("\n\n");
}

/** Whatever the model returned -> clean multi-file blob. */
export function normalizeFiles(text: string, defaultPath: string): string {
  const files = parseFiles(text, defaultPath);
  return files.length ? serializeFiles(files) : text;
}
