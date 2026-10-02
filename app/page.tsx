"use client";

import { useState } from "react";

type Agent = "architect" | "frontend" | "backend";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const [spec, setSpec] = useState("");
  const [frontendCode, setFrontendCode] = useState("");
  const [backendCode, setBackendCode] = useState("");

  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");

  const [specCustomPrompt, setSpecCustomPrompt] = useState("");
  const [frontendCustomPrompt, setFrontendCustomPrompt] = useState("");
  const [backendCustomPrompt, setBackendCustomPrompt] = useState("");

  const [customizingAgent, setCustomizingAgent] =
    useState<Agent | null>(null);

  // ============================================================
  // GENERATE APPLICATION
  // ============================================================

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!prompt.trim()) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Application generation failed.");
      }

      setSpec(data.spec || "");
      setFrontendCode(data.frontend || "");
      setBackendCode(data.backend || "");

      setActiveTab("code");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Network error.";

      alert(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // CUSTOMIZE EXISTING AGENT OUTPUT
  // ============================================================

  const handleCustomize = async (agent: Agent) => {
    const instruction =
      agent === "architect"
        ? specCustomPrompt
        : agent === "frontend"
          ? frontendCustomPrompt
          : backendCustomPrompt;

    const currentCode =
      agent === "architect"
        ? spec
        : agent === "frontend"
          ? frontendCode
          : backendCode;

    if (!instruction.trim() || !currentCode.trim()) {
      return;
    }

    setCustomizingAgent(agent);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent,
          currentCode,
          instruction: instruction.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.updatedCode) {
        throw new Error(
          data?.error || "Customization failed."
        );
      }

      if (agent === "architect") {
        setSpec(data.updatedCode);
        setSpecCustomPrompt("");
      } else if (agent === "frontend") {
        setFrontendCode(data.updatedCode);
        setFrontendCustomPrompt("");
      } else {
        setBackendCode(data.updatedCode);
        setBackendCustomPrompt("");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Customization failed.";

      alert(`Error: ${message}`);
    } finally {
      setCustomizingAgent(null);
    }
  };

  // ============================================================
  // BUILD LIVE PREVIEW
  // ============================================================

  const generatePreviewDoc = () => {
    if (!frontendCode.trim()) {
      return "";
    }

    let cleanCode = frontendCode;

    /*
     * Remove imports because the preview executes inside a browser
     * iframe and React is already provided through the CDN.
     */
    cleanCode = cleanCode
      .replace(
        /import\s+[\s\S]*?from\s+["'][^"']+["'];?/g,
        ""
      )
      .replace(
        /import\s+["'][^"']+["'];?/g,
        ""
      )
      .replace(
        /export\s+default\s+function/g,
        "function"
      )
      .replace(
        /export\s+function/g,
        "function"
      )
      .replace(
        /export\s+default\s+(?=(?:const|let|var)\s+)/g,
        ""
      )
      .replace(
        /export\s+default\s+\w+\s*;?/g,
        ""
      )
      .replace(
        /export\s+(?=(?:const|let|var|function)\s+)/g,
        ""
      )
      .replace(
        /["']use client["'];?/g,
        ""
      )
      .trim();

    /*
     * Find the first likely React component.
     *
     * Supports:
     * function App() {}
     * const App = () => {}
     * const App = function () {}
     */
    let componentName = "App";

    const functionMatch = cleanCode.match(
      /\bfunction\s+([A-Z][A-Za-z0-9_]*)\s*\(/
    );

    const constMatch = cleanCode.match(
      /\b(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]*)\s*=>/
    );

    if (functionMatch?.[1]) {
      componentName = functionMatch[1];
    } else if (constMatch?.[1]) {
      componentName = constMatch[1];
    }

    /*
     * Prevent a generated closing script tag from terminating
     * our preview document early.
     */
    const safeCode = cleanCode.replace(
      /<\/script/gi,
      "<\\/script"
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <script src="https://cdn.tailwindcss.com"></script>

  <script
    src="https://unpkg.com/react@18/umd/react.development.js"
    crossorigin
  ></script>

  <script
    src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"
    crossorigin
  ></script>

  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

  <style>
    html,
    body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: #0a0a0a;
      color: #ededed;
      font-family: Arial, Helvetica, sans-serif;
    }

    #root {
      min-height: 100vh;
    }
  </style>
</head>

<body>
  <div id="root"></div>

  <script>
    function renderError(message) {
      const root = document.getElementById("root");

      if (!root) {
        return;
      }

      root.innerHTML =
        '<div style="' +
        'padding:24px;' +
        'margin:16px;' +
        'background:#292524;' +
        'color:#f87171;' +
        'font-family:monospace;' +
        'border:1px solid #78716c;' +
        'border-radius:8px;' +
        '">' +
        '<h3 style="margin-top:0;">Live Preview Crashed</h3>' +
        '<p style="white-space:pre-wrap;">' +
        String(message) +
        "</p>" +
        '<p style="color:#a8a29e;font-size:12px;">' +
        "Check the Code Editors tab for invalid generated code." +
        "</p>" +
        "</div>";
    }

    window.addEventListener("error", function(event) {
      renderError(event.message || "Unknown browser error.");
    });

    window.addEventListener(
      "unhandledrejection",
      function(event) {
        renderError(
          event.reason?.message ||
          String(event.reason || "Unhandled promise rejection.")
        );
      }
    );
  </script>

  <script type="text/babel">
    const {
      useState,
      useEffect,
      useMemo,
      useRef,
      useCallback
    } = React;

    try {
      ${safeCode}

      const rootElement =
        document.getElementById("root");

      const root =
        ReactDOM.createRoot(rootElement);

      root.render(
        React.createElement(${componentName})
      );
    } catch (error) {
      renderError(
        error?.stack ||
        error?.message ||
        String(error)
      );
    }
  </script>
</body>
</html>`;
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex overflow-hidden">
      {/* LEFT SIDEBAR */}
      <aside className="w-1/3 border-r border-neutral-800 p-6 flex flex-col h-screen overflow-y-auto">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />

            <h1 className="text-2xl font-bold tracking-tight">
              Co-Dev Studio
            </h1>
          </div>

          <p className="text-neutral-400 text-sm mb-6">
            Triple-Agent Architecture with Live Interactive Preview.
          </p>

          <form
            onSubmit={handleGenerate}
            className="flex flex-col gap-3"
          >
            <label className="text-xs uppercase font-semibold text-neutral-400">
              Describe the App Idea
            </label>

            <textarea
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A simple to-do list web app..."
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 resize-none text-white"
            />

            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading
                ? "Agents Building Full-Stack App..."
                : "Generate App"}
            </button>
          </form>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <section className="w-2/3 flex flex-col h-screen bg-neutral-950">
        {/* TOP BAR */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-3 bg-neutral-900/60">
          <div className="flex items-center gap-2 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
            <button
              type="button"
              onClick={() => setActiveTab("code")}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "code"
                  ? "bg-neutral-800 text-white shadow"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Code Editors
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === "preview"
                  ? "bg-blue-600 text-white shadow"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Preview
            </button>
          </div>

          <span className="text-xs text-neutral-400">
            {activeTab === "preview"
              ? "Interactive App Running"
              : "Editable Agent Buffers"}
          </span>
        </div>

        {/* LIVE PREVIEW */}
        {activeTab === "preview" && (
          <div className="flex-1 bg-neutral-900 p-4 flex flex-col">
            {frontendCode ? (
              <iframe
                title="Live Preview"
                srcDoc={generatePreviewDoc()}
                className="w-full h-full border border-neutral-800 rounded-lg bg-black"
                sandbox="allow-scripts allow-modals"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 gap-2">
                <p className="text-sm">
                  No frontend code available yet.
                </p>

                <p className="text-xs">
                  Generate an app first to see the interactive preview.
                </p>
              </div>
            )}
          </div>
        )}

        {/* CODE EDITORS */}
        {activeTab === "code" && (
          <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">
            {/* AGENT 1 */}
            <div className="flex flex-col border border-neutral-800 rounded-lg p-3 bg-neutral-900/50 min-h-[280px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-900/60 text-purple-300 font-bold uppercase">
                  Agent 1
                </span>

                <span className="text-xs font-semibold text-neutral-300">
                  Architect Spec (Editable)
                </span>
              </div>

              <textarea
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
                className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded p-3 font-mono text-xs text-purple-100 resize-none focus:outline-none focus:border-purple-500"
                spellCheck={false}
              />

              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={specCustomPrompt}
                  onChange={(e) =>
                    setSpecCustomPrompt(e.target.value)
                  }
                  placeholder="Ask Agent 1 to modify spec..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />

                <button
                  type="button"
                  onClick={() => handleCustomize("architect")}
                  disabled={
                    customizingAgent === "architect" || !spec
                  }
                  className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 disabled:bg-neutral-800 text-xs rounded font-medium transition-colors"
                >
                  {customizingAgent === "architect"
                    ? "Working..."
                    : "Customize Spec"}
                </button>
              </div>
            </div>

            {/* AGENT 2 */}
            <div className="flex flex-col border border-neutral-800 rounded-lg p-3 bg-neutral-900/50 min-h-[280px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 font-bold uppercase">
                  Agent 2
                </span>

                <span className="text-xs font-semibold text-neutral-300">
                  Frontend UI (Editable)
                </span>
              </div>

              <textarea
                value={frontendCode}
                onChange={(e) =>
                  setFrontendCode(e.target.value)
                }
                className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded p-3 font-mono text-xs text-blue-100 resize-none focus:outline-none focus:border-blue-500"
                spellCheck={false}
              />

              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={frontendCustomPrompt}
                  onChange={(e) =>
                    setFrontendCustomPrompt(e.target.value)
                  }
                  placeholder="Ask Agent 2 to customize UI..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />

                <button
                  type="button"
                  onClick={() => handleCustomize("frontend")}
                  disabled={
                    customizingAgent === "frontend" ||
                    !frontendCode
                  }
                  className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 disabled:bg-neutral-800 text-xs rounded font-medium transition-colors"
                >
                  {customizingAgent === "frontend"
                    ? "Working..."
                    : "Customize UI"}
                </button>
              </div>
            </div>

            {/* AGENT 3 */}
            <div className="flex flex-col border border-neutral-800 rounded-lg p-3 bg-neutral-900/50 min-h-[280px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-bold uppercase">
                  Agent 3
                </span>

                <span className="text-xs font-semibold text-neutral-300">
                  Backend API (Editable)
                </span>
              </div>

              <textarea
                value={backendCode}
                onChange={(e) =>
                  setBackendCode(e.target.value)
                }
                className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded p-3 font-mono text-xs text-emerald-100 resize-none focus:outline-none focus:border-emerald-500"
                spellCheck={false}
              />

              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={backendCustomPrompt}
                  onChange={(e) =>
                    setBackendCustomPrompt(e.target.value)
                  }
                  placeholder="Ask Agent 3 to customize backend..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />

                <button
                  type="button"
                  onClick={() => handleCustomize("backend")}
                  disabled={
                    customizingAgent === "backend" ||
                    !backendCode
                  }
                  className="px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-600 disabled:bg-neutral-800 text-xs rounded font-medium transition-colors"
                >
                  {customizingAgent === "backend"
                    ? "Working..."
                    : "Customize Backend"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}