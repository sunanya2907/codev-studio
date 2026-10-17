"use client";

import { useState, useEffect } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type Agent = "architect" | "frontend" | "backend" | "database";

interface HistoryItem {
  id: string;
  prompt: string;
  spec: string;
  frontend: string;
  backend: string;
  database: string;
  createdAt: string;
}

export default function EditorClient({ userName }: { userName: string | null | undefined }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  // Agent Code Buffers
  const [spec, setSpec] = useState("");
  const [frontendCode, setFrontendCode] = useState("");
  const [backendCode, setBackendCode] = useState("");
  const [databaseCode, setDatabaseCode] = useState("");

  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");

  // Agent Custom Prompt Buffers
  const [specCustomPrompt, setSpecCustomPrompt] = useState("");
  const [frontendCustomPrompt, setFrontendCustomPrompt] = useState("");
  const [backendCustomPrompt, setBackendCustomPrompt] = useState("");
  const [databaseCustomPrompt, setDatabaseCustomPrompt] = useState("");

  const [customizingAgent, setCustomizingAgent] = useState<Agent | null>(null);

  // Agent 5: Deployment & Domain State
  const [cloudProvider, setCloudProvider] = useState("vercel");
  const [deploying, setDeploying] = useState(false);
  
  const [domainQuery, setDomainQuery] = useState("");
  const [isSearchingDomain, setIsSearchingDomain] = useState(false);
  const [domainResult, setDomainResult] = useState<{ available: boolean; domain: string } | null>(null);
  const [suggestedDomains, setSuggestedDomains] = useState<Array<{ domain: string; available: boolean; price: number }>>([]);

  // Pricing & Usage State (3 free uses per month)
  const [generationsLeft, setGenerationsLeft] = useState(3);
  const [showPricingModal, setShowPricingModal] = useState(false);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Fetch generation history on load
  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((data) => {
        if (data.history) setHistory(data.history);
      })
      .catch(() => {});
  }, [loading]);

  // ============================================================
  // DOMAIN SEARCH & SUGGESTIONS HANDLER
  // ============================================================
  const handleDomainSearch = async (isSuggestion = false) => {
    if (!domainQuery.trim()) return;
    
    setIsSearchingDomain(true);
    if (!isSuggestion) setDomainResult(null);
    if (isSuggestion) setSuggestedDomains([]);

    try {
      const endpoint = isSuggestion 
        ? `/api/domain?domain=${encodeURIComponent(domainQuery.trim())}&suggest=true`
        : `/api/domain?domain=${encodeURIComponent(domainQuery.trim())}`;

      const res = await fetch(endpoint);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Domain operation failed.");
      }

      if (isSuggestion) {
        setSuggestedDomains(data.suggestions || []);
      } else {
        setDomainResult({
          available: data.available,
          domain: data.domain,
        });
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSearchingDomain(false);
    }
  };

  // ============================================================
  // GENERATE FULL APPLICATION
  // ============================================================
  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    if (generationsLeft <= 0) {
      setShowPricingModal(true);
      return;
    }
    
    setLoading(true);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Application generation failed.");
      }

      setSpec(data.spec || "");
      setFrontendCode(data.frontend || "");
      setBackendCode(data.backend || "");
      setDatabaseCode(data.database || "");

      // Decrement remaining free uses
      setGenerationsLeft((prev) => Math.max(0, prev - 1));
      setActiveTab("code");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error.";
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
      agent === "architect" ? specCustomPrompt :
      agent === "frontend" ? frontendCustomPrompt :
      agent === "backend" ? backendCustomPrompt : databaseCustomPrompt;

    const currentCode =
      agent === "architect" ? spec :
      agent === "frontend" ? frontendCode :
      agent === "backend" ? backendCode : databaseCode;

    if (!instruction.trim() || !currentCode.trim()) return;

    setCustomizingAgent(agent);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent,
          currentCode,
          instruction: instruction.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.updatedCode) {
        throw new Error(data?.error || "Customization failed.");
      }

      if (agent === "architect") {
        setSpec(data.updatedCode);
        setSpecCustomPrompt("");
      } else if (agent === "frontend") {
        setFrontendCode(data.updatedCode);
        setFrontendCustomPrompt("");
      } else if (agent === "backend") {
        setBackendCode(data.updatedCode);
        setBackendCustomPrompt("");
      } else if (agent === "database") {
        setDatabaseCode(data.updatedCode);
        setDatabaseCustomPrompt("");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Customization failed.";
      alert(`Error: ${message}`);
    } finally {
      setCustomizingAgent(null);
    }
  };

  // ============================================================
  // DOWNLOAD PROJECT FOLDER (.ZIP) WITH AGENT 5 CONFIGS
  // ============================================================
  const handleDownloadProject = async () => {
    if (!frontendCode && !backendCode && !databaseCode) {
      alert("No code generated yet. Please generate an app first.");
      return;
    }

    const zip = new JSZip();
    
    const safeName = prompt.trim().split(" ").slice(0, 3).join("-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase() || "build-core-app";
    const rootFolder = zip.folder(safeName);

    if (!rootFolder) return;

    if (spec) rootFolder.file("README.md", `# ${safeName}\n\n## Architect Specification\n\n${spec}`);

    if (frontendCode) {
      rootFolder.file("app/page.tsx", frontendCode);
      rootFolder.file("app/globals.css", `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nhtml, body { min-height: 100vh; background: #000; color: #fff; }`);
    }

    if (backendCode) {
      rootFolder.file("app/api/route.ts", backendCode);
    }

    if (databaseCode) {
      rootFolder.file("prisma/schema.prisma", databaseCode);
    }

    rootFolder.file(
      "public/robots.txt",
      `User-agent: *\nAllow: /\n\nSitemap: https://${safeName}.vercel.app/sitemap.xml`
    );

    rootFolder.file(
      "public/sitemap.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://${safeName}.vercel.app/</loc>\n    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>`
    );

    if (cloudProvider === "vercel") {
      rootFolder.file(
        "vercel.json",
        JSON.stringify({
            framework: "nextjs",
            buildCommand: databaseCode ? "prisma generate && next build" : "next build",
          }, null, 2)
      );
    } else if (cloudProvider === "gcp") {
      const dockerfileContent = `FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
${databaseCode ? "COPY prisma ./prisma/" : ""}
RUN npm install
COPY . .
${databaseCode ? "RUN npx prisma generate" : ""}
RUN npm run build
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
`;
      rootFolder.file("Dockerfile", dockerfileContent);
      rootFolder.file(
        "cloudbuild.yaml",
        `steps:\n  - name: 'gcr.io/cloud-builders/docker'\n    args: ['build', '-t', 'gcr.io/$PROJECT_ID/${safeName}', '.']\n  - name: 'gcr.io/cloud-builders/docker'\n    args: ['push', 'gcr.io/$PROJECT_ID/${safeName}']\n  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'\n    entrypoint: gcloud\n    args: ['run', 'deploy', '${safeName}', '--image', 'gcr.io/$PROJECT_ID/${safeName}', '--region', 'us-central1', '--platform', 'managed', '--allow-unauthenticated']\nimages:\n  - 'gcr.io/$PROJECT_ID/${safeName}'`
      );
      rootFolder.file(".dockerignore", `node_modules\n.next\n.git\n`);
    } else if (cloudProvider === "aws") {
      const dockerfileContent = `FROM node:18-alpine AS runner
WORKDIR /app
COPY package*.json ./
${databaseCode ? "COPY prisma ./prisma/" : ""}
RUN npm install
COPY . .
${databaseCode ? "RUN npx prisma generate" : ""}
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
`;
      rootFolder.file("Dockerfile", dockerfileContent);
      rootFolder.file(
        "Dockerrun.aws.json",
        JSON.stringify({
            AWSEBDockerrunVersion: "1",
            Image: { Name: `${safeName}:latest`, Update: "true" },
            Ports: [{ ContainerPort: "3000" }],
          }, null, 2)
      );
      rootFolder.file(".dockerignore", `node_modules\n.next\n.git\n`);
    } else if (cloudProvider === "firebase") {
      rootFolder.file(
        "firebase.json",
        JSON.stringify({
            hosting: {
              source: ".",
              ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
              frameworksBackend: { region: "us-central1" },
            },
          }, null, 2)
      );
    }

    rootFolder.file("package.json", JSON.stringify({
      name: safeName,
      version: "0.1.0",
      private: true,
      scripts: {
        "dev": "next dev",
        "build": "next build",
        "start": "next start",
        ...(databaseCode ? { "db:push": "prisma db push" } : {})
      },
      dependencies: {
        "next": "15.0.0",
        "react": "19.0.0-rc",
        "react-dom": "19.0.0-rc",
        ...(databaseCode ? { "@prisma/client": "^5.0.0" } : {})
      },
      devDependencies: {
        "tailwindcss": "^3.4.1",
        "postcss": "^8",
        "typescript": "^5",
        ...(databaseCode ? { "prisma": "^5.0.0" } : {})
      }
    }, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${safeName}.zip`);
  };

  // ============================================================
  // BUILD LIVE PREVIEW IFRAME DOC
  // ============================================================
  const generatePreviewDoc = () => {
    if (!frontendCode.trim()) return "";

    let cleanCode = frontendCode;

    cleanCode = cleanCode
      .replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g, "")
      .replace(/import\s+["'][^"']+["'];?/g, "")
      .replace(/export\s+default\s+function/g, "function")
      .replace(/export\s+function/g, "function")
      .replace(/export\s+default\s+(?=(?:const|let|var)\s+)/g, "")
      .replace(/export\s+default\s+\w+\s*;?/g, "")
      .replace(/export\s+(?=(?:const|let|var|function)\s+)/g, "")
      .replace(/["']use client["'];?/g, "")
      .trim();

    let componentName = "App";

    const functionMatch = cleanCode.match(/\bfunction\s+([A-Z][A-Za-z0-9_]*)\s*\(/);
    const constMatch = cleanCode.match(/\b(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]*)\s*=>/);

    if (functionMatch?.[1]) {
      componentName = functionMatch[1];
    } else if (constMatch?.[1]) {
      componentName = constMatch[1];
    }

    const safeCode = cleanCode.replace(/<\/script/gi, "<\\/script");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    html, body { margin: 0; padding: 0; min-height: 100%; background: #0a0a0a; color: #ededed; font-family: Arial, Helvetica, sans-serif; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    function renderError(message) {
      const root = document.getElementById("root");
      if (!root) return;
      root.innerHTML = '<div style="padding:24px;margin:16px;background:#292524;color:#f87171;font-family:monospace;border:1px solid #78716c;border-radius:8px;"><h3 style="margin-top:0;">Live Preview Crashed</h3><p style="white-space:pre-wrap;">' + String(message) + "</p><p style='color:#a8a29e;font-size:12px;'>Check the Code Editors tab for invalid generated code.</p></div>";
    }
    window.addEventListener("error", function(event) { renderError(event.message || "Unknown browser error."); });
    window.addEventListener("unhandledrejection", function(event) { renderError(event.reason?.message || String(event.reason || "Unhandled promise rejection.")); });
  </script>
  <script type="text/babel">
    const { useState, useEffect, useMemo, useRef, useCallback } = React;
    try {
      ${safeCode}
      const rootElement = document.getElementById("root");
      const root = ReactDOM.createRoot(rootElement);
      root.render(React.createElement(${componentName}));
    } catch (error) {
      renderError(error?.stack || error?.message || String(error));
    }
  </script>
</body>
</html>`;
  };

  // ============================================================
  // UI RENDER
  // ============================================================
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex overflow-hidden">
      {/* LEFT SIDEBAR */}
      <aside className="w-1/3 border-r border-neutral-800 p-6 flex flex-col h-screen overflow-y-auto">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-2xl font-bold tracking-tight">Build_Core</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="text-[11px] font-mono px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-blue-400 hover:text-blue-300 transition-colors"
              >
                History ({history.length})
              </button>
              <span className="text-[11px] font-mono px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
                Free Uses: <strong className="text-yellow-400">{generationsLeft}/3</strong>
              </span>
            </div>
          </div>
          <p className="text-neutral-400 text-sm mb-6">
            Multi-Agent Architecture with Live Interactive Preview.
          </p>
          <form onSubmit={handleGenerate} className="flex flex-col gap-3">
            <label className="text-xs uppercase font-semibold text-neutral-400">
              Describe the App Idea
            </label>
            <textarea
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A task manager with a PostgreSQL database..."
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 resize-none text-white"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? "Agents Synthesizing Code..." : generationsLeft <= 0 ? "Unlock Unlimited Generates" : "Generate App"}
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
            
            {/* EXPORT ZIP BUTTON */}
            <button
              type="button"
              onClick={handleDownloadProject}
              className="ml-2 px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow hover:scale-105 transition-transform"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Project
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-neutral-400">
              {activeTab === "preview" ? "Interactive App Running" : "Editable Agent Buffers"}
            </span>
            {userName && (
              <span className="text-xs text-neutral-500 border-l border-neutral-700 pl-4">
                User: {userName}
              </span>
            )}
          </div>
        </div>

        {/* LIVE PREVIEW IFRAME */}
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
                <p className="text-sm">No frontend code available yet.</p>
                <p className="text-xs">Generate an app first to see the interactive preview.</p>
              </div>
            )}
          </div>
        )}

        {/* CODE EDITORS */}
        {activeTab === "code" && (
          <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4 pb-20">
            
            {/* AGENT 1: ARCHITECT */}
            <div className="flex flex-col border border-neutral-800 rounded-lg p-3 bg-neutral-900/50 min-h-[280px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-900/60 text-purple-300 font-bold uppercase">Agent 1</span>
                <span className="text-xs font-semibold text-neutral-300">Architect Spec (Editable)</span>
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
                  onChange={(e) => setSpecCustomPrompt(e.target.value)}
                  placeholder="Ask Agent 1 to modify spec..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={() => handleCustomize("architect")}
                  disabled={customizingAgent === "architect" || !spec}
                  className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 disabled:bg-neutral-800 text-xs rounded font-medium transition-colors"
                >
                  {customizingAgent === "architect" ? "Working..." : "Customize Spec"}
                </button>
              </div>
            </div>

            {/* AGENT 2: FRONTEND */}
            <div className="flex flex-col border border-neutral-800 rounded-lg p-3 bg-neutral-900/50 min-h-[280px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 font-bold uppercase">Agent 2</span>
                <span className="text-xs font-semibold text-neutral-300">Frontend UI (Editable)</span>
              </div>
              <textarea
                value={frontendCode}
                onChange={(e) => setFrontendCode(e.target.value)}
                className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded p-3 font-mono text-xs text-blue-100 resize-none focus:outline-none focus:border-blue-500"
                spellCheck={false}
              />
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={frontendCustomPrompt}
                  onChange={(e) => setFrontendCustomPrompt(e.target.value)}
                  placeholder="Ask Agent 2 to customize UI..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleCustomize("frontend")}
                  disabled={customizingAgent === "frontend" || !frontendCode}
                  className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 disabled:bg-neutral-800 text-xs rounded font-medium transition-colors"
                >
                  {customizingAgent === "frontend" ? "Working..." : "Customize UI"}
                </button>
              </div>
            </div>

            {/* AGENT 3: BACKEND */}
            <div className="flex flex-col border border-neutral-800 rounded-lg p-3 bg-neutral-900/50 min-h-[280px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-bold uppercase">Agent 3</span>
                <span className="text-xs font-semibold text-neutral-300">Backend API (Editable)</span>
              </div>
              <textarea
                value={backendCode}
                onChange={(e) => setBackendCode(e.target.value)}
                className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded p-3 font-mono text-xs text-emerald-100 resize-none focus:outline-none focus:border-emerald-500"
                spellCheck={false}
              />
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={backendCustomPrompt}
                  onChange={(e) => setBackendCustomPrompt(e.target.value)}
                  placeholder="Ask Agent 3 to customize backend..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => handleCustomize("backend")}
                  disabled={customizingAgent === "backend" || !backendCode}
                  className="px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-600 disabled:bg-neutral-800 text-xs rounded font-medium transition-colors"
                >
                  {customizingAgent === "backend" ? "Working..." : "Customize Backend"}
                </button>
              </div>
            </div>

            {/* AGENT 4: DATABASE ADMINISTRATOR */}
            <div className="flex flex-col border border-neutral-800 rounded-lg p-3 bg-neutral-900/50 min-h-[280px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-orange-900/60 text-orange-300 font-bold uppercase">Agent 4</span>
                <span className="text-xs font-semibold text-neutral-300">Database Schema (Prisma)</span>
              </div>
              <textarea
                value={databaseCode}
                onChange={(e) => setDatabaseCode(e.target.value)}
                className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded p-3 font-mono text-xs text-orange-100 resize-none focus:outline-none focus:border-orange-500"
                spellCheck={false}
              />
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={databaseCustomPrompt}
                  onChange={(e) => setDatabaseCustomPrompt(e.target.value)}
                  placeholder="Ask Agent 4 to modify the schema (e.g., 'Add a User relation')..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => handleCustomize("database")}
                  disabled={customizingAgent === "database" || !databaseCode}
                  className="px-3 py-1.5 bg-orange-600/80 hover:bg-orange-600 disabled:bg-neutral-800 text-xs rounded font-medium transition-colors"
                >
                  {customizingAgent === "database" ? "Working..." : "Customize DB"}
                </button>
              </div>
            </div>

            {/* AGENT 5: DEPLOYMENT & DOMAINS */}
            <div className="flex flex-col border border-neutral-800 rounded-lg p-3 bg-neutral-900/50 min-h-[280px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-yellow-900/60 text-yellow-300 font-bold uppercase">Agent 5</span>
                  <span className="text-xs font-semibold text-neutral-300">Global Deployment & Domain AI</span>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-4">
                {/* Domain Search & Suggestion UI */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-neutral-400 uppercase">Find or Suggest Custom Domain</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={domainQuery}
                      onChange={(e) => setDomainQuery(e.target.value)}
                      placeholder="e.g. novels"
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleDomainSearch(false)}
                      disabled={isSearchingDomain || !domainQuery}
                      className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600 text-xs rounded font-semibold transition-colors"
                    >
                      Check
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDomainSearch(true)}
                      disabled={isSearchingDomain || !domainQuery}
                      className="px-3 py-2 bg-yellow-600/80 hover:bg-yellow-600 disabled:bg-neutral-900 disabled:text-neutral-600 text-xs rounded font-semibold transition-colors"
                    >
                      {isSearchingDomain ? "Thinking..." : "Suggest Names"}
                    </button>
                  </div>
                  
                  {/* Single Search Result */}
                  {domainResult && (
                    <div className={`mt-2 p-3 rounded text-sm flex items-center justify-between border ${domainResult.available ? "bg-emerald-900/20 border-emerald-800 text-emerald-400" : "bg-red-900/20 border-red-800 text-red-400"}`}>
                      <span>
                        <strong>{domainResult.domain}</strong> is {domainResult.available ? "available!" : "already taken."}
                      </span>
                      {domainResult.available && (
                        <button type="button" className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded">
                          Secure
                        </button>
                      )}
                    </div>
                  )}

                  {/* AI Suggested Names List */}
                  {suggestedDomains.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Agent 5 Domain Suggestions:</span>
                      {suggestedDomains.map((item, idx) => (
                        <div key={idx} className="p-2.5 bg-neutral-950 border border-neutral-800 rounded flex items-center justify-between text-xs">
                          <span className="font-mono text-yellow-300">{item.domain}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-emerald-400 font-semibold">${(item.price / 100).toFixed(2)}/yr</span>
                            <button type="button" className="px-2.5 py-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded">
                              Secure
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cloud Infrastructure UI */}
                <div className="flex flex-col gap-1.5 border-t border-neutral-800 pt-4 mt-2">
                  <label className="text-xs font-semibold text-neutral-400 uppercase">Select Cloud Infrastructure</label>
                  <select
                    value={cloudProvider}
                    onChange={(e) => setCloudProvider(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-sm text-neutral-200 focus:outline-none focus:border-yellow-500"
                  >
                    <option value="vercel">Vercel (Zero-Config Edge Network)</option>
                    <option value="gcp">Google Cloud Run (Docker Container)</option>
                    <option value="aws">AWS EC2 (Scalable Compute)</option>
                    <option value="firebase">Google Firebase (App Hosting)</option>
                  </select>
                </div>

                <div className="p-4 bg-black/40 border border-neutral-800 rounded text-xs text-neutral-400 font-mono flex-1">
                  {cloudProvider === "vercel" && "> Agent 5 will configure vercel.json and trigger a Git push for automatic edge deployment."}
                  {cloudProvider === "gcp" && "> Agent 5 will generate a Dockerfile and cloudbuild.yaml for Google Cloud containerization."}
                  {cloudProvider === "aws" && "> Agent 5 will configure a Dockerfile and AWS Elastic Beanstalk deployment scripts."}
                  {cloudProvider === "firebase" && "> Agent 5 will generate firebase.json and link to a Google Cloud Firebase project."}
                </div>

                <button
                  type="button"
                  onClick={() => setDeploying(true)}
                  disabled={deploying || (!frontendCode && !backendCode)}
                  className="w-full py-2 bg-yellow-600/80 hover:bg-yellow-600 disabled:bg-neutral-800 disabled:text-neutral-600 text-sm rounded font-bold transition-colors"
                >
                  {deploying ? "Agent 5 Provisioning Servers..." : "Initialize Global Deployment"}
                </button>
              </div>
            </div>
            
          </div>
        )}
      </section>

      {/* HISTORY MODAL */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl p-6 text-white relative shadow-2xl max-h-[80vh] flex flex-col">
            <button
              onClick={() => setShowHistoryModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            <div className="mb-6">
              <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold uppercase tracking-wider">
                Previous Generations
              </span>
              <h2 className="text-2xl font-extrabold mt-2 tracking-tight">Your Generation History</h2>
              <p className="text-neutral-400 text-xs mt-1">
                Select any past project to instantly load its code back into the multi-agent editor.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {history.length === 0 ? (
                <div className="text-center py-12 text-neutral-500 text-sm">
                  No generation history found yet. Build an app to see it here!
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setPrompt(item.prompt);
                      setSpec(item.spec);
                      setFrontendCode(item.frontend);
                      setBackendCode(item.backend);
                      setDatabaseCode(item.database);
                      setShowHistoryModal(false);
                    }}
                    className="p-4 bg-neutral-950 border border-neutral-800 hover:border-blue-500/60 rounded-xl cursor-pointer transition-all flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                      <span>ID: {item.id.slice(-6)}</span>
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm font-semibold text-neutral-200 line-clamp-2">{item.prompt}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRICING & UPGRADE MODAL */}
      {showPricingModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl p-6 text-white relative shadow-2xl">
            <button
              onClick={() => setShowPricingModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            <div className="text-center mb-8">
              <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-bold uppercase tracking-wider">
                Monthly Limit Reached
              </span>
              <h2 className="text-2xl font-extrabold mt-2 tracking-tight">Upgrade to Pro Builder</h2>
              <p className="text-neutral-400 text-sm mt-1">
                You have used your 3 free monthly app generations. Unlock unlimited AI multi-agent orchestration.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {/* Free Tier Card */}
              <div className="border border-neutral-800 rounded-xl p-5 bg-neutral-950 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm text-neutral-300">Free Explorer</h3>
                  <div className="text-2xl font-black mt-2">$0 <span className="text-xs font-normal text-neutral-500">/mo</span></div>
                  <ul className="text-xs text-neutral-400 mt-4 space-y-2">
                    <li>✓ 3 generations per month</li>
                    <li>✓ Standard .zip exports</li>
                    <li>✗ Unlimited AI generation</li>
                    <li>✗ Advanced Agent 5 Cloud Deploy</li>
                  </ul>
                </div>
                <button disabled className="mt-6 w-full py-2 bg-neutral-800 text-neutral-500 text-xs rounded font-bold cursor-not-allowed">
                  Current Plan
                </button>
              </div>

              {/* Pro Tier Card (80% Profit Driver) */}
              <div className="border-2 border-yellow-500/80 rounded-xl p-5 bg-gradient-to-b from-yellow-950/20 to-neutral-950 flex flex-col justify-between relative shadow-lg shadow-yellow-500/10">
                <div className="absolute -top-3 right-4 bg-yellow-500 text-black text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                  Most Popular
                </div>
                <div>
                  <h3 className="font-bold text-sm text-yellow-400">Pro Builder</h3>
                  <div className="text-2xl font-black mt-2">$29 <span className="text-xs font-normal text-neutral-400">/mo</span></div>
                  <ul className="text-xs text-neutral-300 mt-4 space-y-2">
                    <li>✓ <strong>Unlimited</strong> app generations</li>
                    <li>✓ Direct GitHub & Vercel deployment</li>
                    <li>✓ AI Domain Suggestion & Registry</li>
                    <li>✓ Priority multi-agent execution</li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    alert("Redirecting to secure checkout gateway...");
                    setShowPricingModal(false);
                  }}
                  className="mt-6 w-full py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-xs rounded-lg font-extrabold transition-all shadow"
                >
                  Upgrade Now ($29/mo)
                </button>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[11px] text-neutral-500">
                Secure payment processed via Stripe. Cancel or switch plans anytime with a single click.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}