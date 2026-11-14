// Agent 5 (the QA & security review) runs as its OWN request after agents 1-4 are saved, so it gets
// a fresh time budget. While it is running, the saved QA text carries this marker.
export const QA_PENDING_MARKER = "<!--QA_PENDING-->";
const WARN_MARKER = "<!--WARNINGS-->";

export const isQaPending = (text?: string | null): boolean => !!text && text.includes(QA_PENDING_MARKER);

/** The placeholder saved with the build; `warnings` (small problems found in agents 1-4) are carried along. */
export function qaPendingText(warnings: string[] = []): string {
  return (
    "# QA & Security Report\nAgent 5 is reviewing your finished code. The report appears here in a moment.\n" +
    QA_PENDING_MARKER +
    (warnings.length ? `\n${WARN_MARKER}\n${warnings.map((w) => `- ${w}`).join("\n")}` : "")
  );
}

/** Warnings carried inside the placeholder, as a Markdown block ("" when there are none). */
export function carriedWarnings(text: string): string {
  const i = text.indexOf(WARN_MARKER);
  if (i < 0) return "";
  const lines = text.slice(i + WARN_MARKER.length).trim();
  return lines ? `\n\n---\n## Output warnings\nThe agents' answers passed with these small problems:\n${lines}\n` : "";
}
