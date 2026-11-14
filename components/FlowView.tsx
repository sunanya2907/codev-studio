"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";

type Segment = { kind: "text"; text: string } | { kind: "diagram"; code: string };

/** Split the Markdown into plain text parts and ```mermaid diagram parts, in order. */
function splitSegments(md: string): Segment[] {
  const out: Segment[] = [];
  const re = /```mermaid[ \t]*\r?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    if (m.index > last) out.push({ kind: "text", text: md.slice(last, m.index) });
    out.push({ kind: "diagram", code: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < md.length) out.push({ kind: "text", text: md.slice(last) });
  return out;
}

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      // "strict" strips scripts / click handlers from the diagram: the text comes from an AI.
      mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict", flowchart: { htmlLabels: false, curve: "basis" } });
      return mermaid;
    });
  }
  return mermaidReady;
}

let counter = 0;

function Diagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const idRef = useRef(`flow-${++counter}`);

  useEffect(() => {
    let cancelled = false;
    setSvg("");
    setError("");
    loadMermaid()
      .then((mermaid) => mermaid.render(`${idRef.current}-${Date.now()}`, code))
      .then((res) => {
        if (!cancelled) setSvg(res.svg);
      })
      .catch(() => {
        if (!cancelled) setError("This diagram could not be drawn. The text version is shown instead.");
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const download = () => {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowchart.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (error)
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-[11px] text-amber-300 mb-2">{error}</p>
        <pre className="select-text whitespace-pre-wrap text-[11px] text-slate-300 font-mono">{code}</pre>
      </div>
    );
  if (!svg)
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-6 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Drawing flowchart…
      </div>
    );
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B1020] p-3">
      <div className="overflow-x-auto flex justify-center [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex justify-end mt-2">
        <button onClick={download} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition">
          <Download className="w-3 h-3" /> Download SVG
        </button>
      </div>
    </div>
  );
}

/** Light Markdown for the parts around the diagrams: headings, bullets, ```text code blocks. */
function TextBlock({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      nodes.push(
        <pre key={key++} className="select-text overflow-x-auto rounded-xl border border-slate-800 bg-[#0B1020] p-3 text-[11px] leading-relaxed text-emerald-200 font-mono">
          {buf.join("\n")}
        </pre>
      );
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const cls = h[1].length === 1 ? "text-base font-extrabold text-white mt-1" : h[1].length === 2 ? "text-sm font-bold text-cyan-300 mt-3" : "text-xs font-bold text-violet-300 mt-2";
      nodes.push(<div key={key++} className={cls}>{h[2]}</div>);
    } else if (/^\s*[-*]\s+/.test(line)) {
      nodes.push(<div key={key++} className="select-text text-xs text-slate-300 pl-4 -indent-3">• {line.replace(/^\s*[-*]\s+/, "")}</div>);
    } else if (line.trim()) {
      nodes.push(<p key={key++} className="select-text text-xs text-slate-300 leading-relaxed">{line}</p>);
    }
    i++;
  }
  return <>{nodes}</>;
}

/** Pseudocode & Flowchart view: flowcharts drawn as diagrams, pseudocode as readable blocks. */
export default function FlowView({ source }: { source: string }) {
  const segments = useMemo(() => splitSegments(source), [source]);
  return (
    <div className="flex-1 overflow-y-auto bg-[#090D16] p-4 sm:p-6 space-y-3">
      {segments.map((s, idx) =>
        s.kind === "diagram" ? <Diagram key={`d${idx}-${s.code.length}`} code={s.code} /> : <TextBlock key={`t${idx}`} text={s.text} />
      )}
    </div>
  );
}
    