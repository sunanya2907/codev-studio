// Files / images the person attaches next to the Customize box (any agent).
// Images and PDFs go to Gemini as inline data, text and code files are pasted into the prompt.
// Shared by the server route; the browser side lives in lib/attachments-client.ts.
export type AttachmentIn = { name: string; mimeType: string; data?: string; text?: string };

export const MAX_ATTACHMENTS = 4;
export const MAX_MEDIA_BASE64 = 2_500_000; // per image / PDF (Vercel rejects request bodies above ~4.5 MB)
export const MAX_TOTAL_BASE64 = 3_200_000;
export const MAX_TEXT_FILE = 60_000;
export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

export type ParsedAttachments =
  | { ok: true; media: { mimeType: string; data: string }[]; names: string[]; textBlock: string }
  | { ok: false; error: string };

export function parseAttachments(raw: unknown): ParsedAttachments {
  const list = Array.isArray(raw) ? (raw as AttachmentIn[]).slice(0, MAX_ATTACHMENTS) : [];
  const media: { mimeType: string; data: string }[] = [];
  const names: string[] = [];
  const texts: string[] = [];
  let total = 0;
  for (const f of list) {
    if (!f || typeof f.name !== "string") continue;
    const name = f.name.replace(/[^\w.\- ]/g, "_").slice(0, 100) || "file";
    if (typeof f.data === "string" && MEDIA_TYPES.includes(f.mimeType)) {
      total += f.data.length;
      if (f.data.length > MAX_MEDIA_BASE64 || total > MAX_TOTAL_BASE64) {
        return { ok: false, error: "The attached files are too big (about 2 MB in total is the limit)." };
      }
      media.push({ mimeType: f.mimeType, data: f.data });
      names.push(name);
    } else if (typeof f.text === "string") {
      texts.push(`--- ${name} ---\n${f.text.slice(0, MAX_TEXT_FILE)}`);
      names.push(name);
    }
  }
  const mediaNames = names.slice(0, media.length).join(", ");
  const textBlock =
    (texts.length ? `\n\nFILES THE PERSON ATTACHED (text):\n${texts.join("\n\n")}` : "") +
    (media.length
      ? `\n\n${media.length} image/PDF file(s) are attached to this message (${mediaNames}). Look at them and follow them: a screenshot or design to copy, a logo or photo to use, a document to follow. If an image must appear ON the website, reference it as /images/<file name> and tell the person (in one short comment at the top of the file) to save it in public/images/.`
      : "");
  return { ok: true, media, names, textBlock };
}