import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, agent, currentCode, instruction } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is missing. Add it to your .env.local file.",
        },
        { status: 500 }
      );
    }

    /*
     * Keep the model name in one place so it is easy to change later.
     */
    const modelName = "gemini-3.8-flash";

    const callGemini = async (systemPrompt: string) => {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${modelName}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: systemPrompt,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Google API Error ${response.status}: ${errorText}`
        );
      }

      const data = await response.json();

      const candidate = data?.candidates?.[0];

      if (!candidate) {
        throw new Error(
          `Gemini returned no candidate. Raw response: ${JSON.stringify(
            data
          )}`
        );
      }

      if (candidate.finishReason && candidate.finishReason !== "STOP") {
        throw new Error(
          `Gemini stopped with finish reason: ${candidate.finishReason}`
        );
      }

      const text = candidate?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("")
        .trim();

      if (!text) {
        throw new Error(
          `Gemini returned an empty response. Raw response: ${JSON.stringify(
            data
          )}`
        );
      }

      return text;
    };

    /*
     * Remove markdown code fences if Gemini accidentally returns them.
     */
    const stripMarkdown = (text: string) => {
      return text
        .replace(/^```(?:typescript|tsx|javascript|jsx|js|ts)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    };

    // ============================================================
    // MODE A: CUSTOMIZATION / REFINEMENT
    // ============================================================

    if (instruction && currentCode) {
      let refinePrompt = "";

      if (agent === "architect") {
        refinePrompt = `
You are Agent 1: Lead Software Architect.

Existing technical specification:
${currentCode}

User customization request:
${instruction}

Modify the existing specification according to the request.

Rules:
- Preserve useful existing requirements.
- Do not remove functionality unless explicitly requested.
- Return ONLY the complete updated technical specification.
- Do not use markdown code fences.
`;
      } else if (agent === "frontend") {
        refinePrompt = `
You are Agent 2: Expert Frontend Engineer.

Existing frontend code:
${currentCode}

User customization request:
${instruction}

Modify the existing frontend code according to the request.

CRITICAL RULES:
- Return a complete production-ready React component.
- Use plain JavaScript/JSX, not TypeScript.
- Do NOT use import statements.
- Do NOT use export statements.
- Do NOT use external npm packages.
- Do NOT use lucide-react.
- Do NOT use shadcn/ui.
- Use native HTML elements and emojis for icons where appropriate.
- Keep everything inside the component or self-contained in the returned code.
- React and React hooks are already available globally in the live preview.
- Return ONLY code.
- Do NOT use markdown code fences.
`;
      } else if (agent === "backend") {
        refinePrompt = `
You are Agent 3: Expert Backend Engineer.

Existing backend code:
${currentCode}

User customization request:
${instruction}

Modify the existing backend according to the request.

Rules:
- Return complete production-ready Next.js backend code.
- Use realistic API route handlers.
- Include input validation where appropriate.
- Preserve existing functionality unless the user explicitly asks to remove it.
- Return ONLY code.
- Do NOT use markdown code fences.
`;
      } else {
        return NextResponse.json(
          { error: "Invalid agent specified." },
          { status: 400 }
        );
      }

      const updatedCode = await callGemini(refinePrompt);

      return NextResponse.json({
        updatedCode:
          agent === "architect"
            ? updatedCode.trim()
            : stripMarkdown(updatedCode),
      });
    }

    // ============================================================
    // MODE B: INITIAL FULL-STACK GENERATION
    // ============================================================

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // AGENT 1 — ARCHITECT
    // ------------------------------------------------------------

    const architectPrompt = `
You are Agent 1: Lead Software Architect.

User's application idea:
${prompt}

Create a concise technical specification for the application.

Include:
1. Application overview
2. Main UI components
3. User interactions
4. Data structures
5. Required REST API routes
6. Backend requirements
7. Important validation rules
8. Suggested database structure if persistence is required

Return ONLY plain text.
Do not return code fences.
`;

    const spec = await callGemini(architectPrompt);

    // ------------------------------------------------------------
    // AGENT 2 — FRONTEND
    // ------------------------------------------------------------

    const frontendPrompt = `
You are Agent 2: Expert Frontend Engineer.

Build the frontend based on this architecture specification:

${spec}

Original user request:
${prompt}

CRITICAL LIVE PREVIEW RULES:

- Return ONE complete React component.
- Use plain JavaScript/JSX only.
- Do NOT use TypeScript.
- Do NOT use import statements.
- Do NOT use export statements.
- Do NOT use external npm packages.
- Do NOT use lucide-react.
- Do NOT use shadcn/ui.
- Use native HTML elements.
- Emojis can be used for icons.
- React is already available globally.
- React hooks are available globally.
- Use Tailwind CSS classes for styling.
- Make the UI responsive.
- Include realistic interactive state where appropriate.
- Everything must be self-contained.
- Do not reference files that do not exist.
- Do not reference external components.
- Return ONLY clean JSX/JavaScript code.
- Do NOT use markdown code fences.

The component should be renderable directly as:

<App />

or another single capitalized component name.
`;

    // ------------------------------------------------------------
    // AGENT 3 — BACKEND
    // ------------------------------------------------------------

    const backendPrompt = `
You are Agent 3: Expert Backend Engineer.

Build the backend implementation based on this architecture specification:

${spec}

Original user request:
${prompt}

Requirements:

- Create realistic Next.js API route code.
- Include input validation.
- Include realistic CRUD operations when applicable.
- Include appropriate HTTP status codes.
- Keep the code production-oriented.
- Do not invent nonexistent frontend files.
- Clearly separate route-handler code when multiple routes are necessary.
- If a database is required, provide an appropriate Prisma/SQL schema.
- Return ONLY code.
- Do NOT use markdown code fences.
`;

    // Run frontend and backend generation concurrently.
    const [frontendCode, backendCode] = await Promise.all([
      callGemini(frontendPrompt),
      callGemini(backendPrompt),
    ]);

    return NextResponse.json({
      spec: spec.trim(),
      frontend: stripMarkdown(frontendCode),
      backend: stripMarkdown(backendCode),
    });
  } catch (error: unknown) {
    console.error("ORCHESTRATION ERROR:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Operation failed.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}