// Browser side of the attach button: reads files into the shape lib/attachments.ts expects.
export type Attached = { name: string; mimeType: string; data?: string; text?: string; preview?: string };

export const MAX_FILES = 4;
const MAX_FILE_BYTES = 2_000_000;
const TEXT_EXT = /\.(txt|md|json|csv|ts|tsx|js|jsx|css|html|prisma|sql|yml|yaml)$/i;
export const ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.md,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.prisma,.sql,.yml,.yaml";

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });

/** Returns the readable files and a list of problems (too big, unsupported) to show the person. */
export async function readFiles(list: FileList | File[], room: number): Promise<{ files: Attached[]; problems: string[] }> {
  const files: Attached[] = [];
  const problems: string[] = [];
  for (const f of Array.from(list).slice(0, Math.max(0, room))) {
    try {
      if (f.size > MAX_FILE_BYTES) {
        problems.push(`"${f.name}" is bigger than 2 MB.`);
      } else if (/^image\/(png|jpe?g|webp|gif)$/.test(f.type) || f.type === "application/pdf") {
        const data = await readBase64(f);
        const mimeType = f.type === "image/jpg" ? "image/jpeg" : f.type;
        files.push({ name: f.name, mimeType, data, preview: mimeType.startsWith("image/") ? `data:${mimeType};base64,${data}` : undefined });
      } else if (f.type.startsWith("text/") || TEXT_EXT.test(f.name)) {
        files.push({ name: f.name, mimeType: "text/plain", text: (await f.text()).slice(0, 60000) });
      } else {
        problems.push(`"${f.name}" is not supported (use images, PDFs or text/code files).`);
      }
    } catch {
      problems.push(`Could not read "${f.name}".`);
    }
  }
  return { files, problems };
}

export const toPayload = (files: Attached[]) => files.map(({ name, mimeType, data, text }) => ({ name, mimeType, data, text }));