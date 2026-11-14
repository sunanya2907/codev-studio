import "server-only"; // build fails if a client component ever imports this file
// The "contract" is the small, fast first step of a build: SRS sections 5 (data model), 6 (API) and 7 (pages).
// Agents 2, 3 and 4 are built from it right away, in parallel with the writing of the full SRS.

const SECTION_START = (n: number) => new RegExp(`^#{1,3}\\s*${n}[.\\s]`, "m");

/** The contract must hold the three binding sections with real content. Returns a list of problems. */
export function validateContract(text: string): string[] {
  const issues: string[] = [];
  if (text.trim().length < 400) issues.push("The contract is far too short.");
  for (const n of [5, 6, 7]) {
    if (!SECTION_START(n).test(text)) issues.push(`The contract is missing section ${n} (use the exact section headings requested).`);
  }
  if (!/\/api\//.test(text)) issues.push("The API contract (section 6) lists no /api/... endpoints.");
  return issues;
}

/** Text of sections 5 to the end of the contract (or "" if section 5 is missing). */
function contractSections(contract: string): string {
  const m = SECTION_START(5).exec(contract);
  return m ? contract.slice(m.index).trim() : "";
}

/**
 * The code was built from the contract, so the contract must win. Put the contract's sections 5, 6 and 7
 * into the full SRS in place of whatever the SRS agent wrote there, so the document matches the code.
 */
export function mergeContract(spec: string, contract: string): string {
  const sections = contractSections(contract);
  if (!sections) return spec;
  const from = SECTION_START(5).exec(spec);
  if (!from) return `${spec.trim()}\n\n${sections}\n`;
  const rest = spec.slice(from.index);
  const to = SECTION_START(8).exec(rest);
  const before = spec.slice(0, from.index);
  // Keep "8. Out of Scope" (and anything after it) if the SRS has it.
  const after = to ? rest.slice(to.index) : "";
  // The contract may itself end with sections after 7: keep only 5, 6 and 7 from it.
  const eight = SECTION_START(8).exec(sections);
  const core = (eight ? sections.slice(0, eight.index) : sections).trim();
  return `${before}${core}\n\n${after}`.trim() + "\n";
}