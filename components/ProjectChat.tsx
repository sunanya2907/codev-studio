"use client";
// Chat box under the build box (like Claude's): appears after a website was built, lets the person review
// the WHOLE website or ask for changes. "+" attaches images / files, the waveform button dictates by voice.
// Each message is charged on the server; no price is shown here on purpose.
import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, AudioLines, FileText, Plus, X } from "lucide-react";

type Msg = { role: "user" | "ai"; text: string; error?: boolean };
type Attached = { name: string; mimeType: string; data?: string; text?: string; preview?: string };

export type ChatResult = { frontend: string; backend: string; database: string; tokenBalance?: number; changed: string[] };

const MAX_FILE_BYTES = 2_000_000;
const TEXT_EXT = /\.(txt|md|json|csv|ts|tsx|js|jsx|css|html|prisma|sql|env|yml|yaml)$/i;

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });

export default function ProjectChat({
  historyId,
  onApplied,
  onBlocked,
}: {
  historyId: string;
  onApplied: (r: ChatResult) => void;
  onBlocked: () => void; // free plan or out of tokens: parent opens the pricing window
}) {
  const store = useRef<Record<string, Msg[]>>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attached[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  // A different build opens: show that build's own conversation.
  useEffect(() => {
    setMessages(store.current[historyId] ?? []);
    setText("");
    setFiles([]);
  }, [historyId]);
  useEffect(() => {
    store.current[historyId] = messages;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, historyId, busy]);
  useEffect(() => {
    const w = window as any;
    setCanListen(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => recRef.current?.stop?.();
  }, []);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: Attached[] = [];
    for (const f of Array.from(list).slice(0, 4 - files.length)) {
      try {
        if (f.size > MAX_FILE_BYTES) {
          alert(`"${f.name}" is bigger than 2 MB. Please attach a smaller file.`);
          continue;
        }
        if (/^image\/(png|jpe?g|webp|gif)$/.test(f.type) || f.type === "application/pdf") {
          const data = await readBase64(f);
          next.push({
            name: f.name,
            mimeType: f.type === "image/jpg" ? "image/jpeg" : f.type,
            data,
            preview: f.type.startsWith("image/") ? `data:${f.type};base64,${data}` : undefined,
          });
        } else if (f.type.startsWith("text/") || TEXT_EXT.test(f.name)) {
          next.push({ name: f.name, mimeType: "text/plain", text: (await f.text()).slice(0, 60000) });
        } else {
          alert(`"${f.name}" is not supported. Attach images, PDFs or text/code files.`);
        }
      } catch {
        alert(`Could not read "${f.name}".`);
      }
    }
    if (next.length) setFiles((p) => [...p, ...next].slice(0, 4));
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleListen = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recRef.current?.stop?.();
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t) setText((p) => (p ? p.replace(/\s*$/, " ") : "") + t.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    recRef.current?.stop?.();
    const attachments = files.map(({ name, mimeType, data, text }) => ({ name, mimeType, data, text }));
    const shown = files.length ? `${message}\n\n📎 ${files.map((f) => f.name).join(", ")}` : message;
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
    setMessages((p) => [...p, { role: "user", text: shown }]);
    setText("");
    setFiles([]);
    setBusy(true);
    try {
      const res = await fetch("/api/orchestrate/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId, message, attachments, history }),
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: res.status === 413 ? "The files are too big. Attach smaller ones." : "The server took too long or failed. You were not charged." };
      }
      if (!res.ok) {
        if (data.code === "PLAN_LOCKED" || data.code === "OUT_OF_TOKENS") {
          setMessages((p) => p.slice(0, -1));
          setText(message);
          onBlocked();
          return;
        }
        throw new Error(data.error || "Something went wrong.");
      }
      if (data.changed?.length) onApplied(data);
      else if (typeof data.tokenBalance === "number") onApplied({ ...data, changed: [] });
      setMessages((p) => [
        ...p,
        { role: "ai", text: data.reply + (data.changed?.length ? `\n\n✓ Updated: ${data.changed.join(", ")}` : "") },
      ]);
    } catch (e: any) {
      setMessages((p) => [...p, { role: "ai", text: e?.message || "Something went wrong.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const hasInput = text.trim().length > 0;

  return (
    <div className="flex flex-col min-h-0 flex-1 max-h-[34rem] lg:max-h-none">
      <div className="flex-1 min-h-[7rem] overflow-y-auto space-y-3 pr-1 pb-2 text-[13px] leading-relaxed">
        {messages.length === 0 && !busy && (
          <div className="text-slate-400 text-xs px-1 pt-1">
            <p className="font-semibold text-slate-200 text-[13px]">Your website is ready.</p>
            <p className="mt-1">Ask me to review it, or tell me what to change: design, pages, text, features. I update the whole site.</p>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-slate-700/60 px-3 py-2 text-slate-100">{m.text}</div>
            </div>
          ) : (
            <div key={i} className={`whitespace-pre-wrap break-words px-1 ${m.error ? "text-rose-300" : "text-slate-200"}`}>
              {m.text}
            </div>
          )
        )}
        {busy && (
          <div className="px-1 text-slate-400 flex items-center gap-2 text-xs">
            <span className="inline-flex gap-1">
              <i className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.3s]" />
              <i className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.15s]" />
              <i className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" />
            </span>
            Thinking through your whole website...
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="rounded-2xl border border-slate-700/80 bg-[#131B2E] focus-within:border-violet-500/70 transition p-2">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 pb-2">
            {files.map((f, i) => (
              <div key={i} className="relative group flex items-center gap-1.5 max-w-full rounded-lg bg-slate-800/80 border border-slate-700 pl-1.5 pr-6 py-1 text-[11px] text-slate-200">
                {f.preview ? <img src={f.preview} alt="" className="w-7 h-7 rounded object-cover" /> : <FileText className="w-4 h-4 text-slate-400 shrink-0" />}
                <span className="truncate max-w-[7rem]">{f.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          maxLength={3000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Reply to review or change your website"
          className="select-text w-full resize-none bg-transparent px-2 py-1.5 text-base sm:text-[13px] text-slate-100 placeholder-slate-500 focus:outline-none"
        />
        <div className="flex items-center justify-between pt-1">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.md,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.prisma,.sql,.yml,.yaml"
            onChange={(e) => void addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={files.length >= 4}
            title="Add files or images"
            aria-label="Add files or images"
            className="w-8 h-8 rounded-lg text-slate-300 hover:bg-slate-700/60 hover:text-white transition flex items-center justify-center disabled:opacity-40"
          >
            <Plus className="w-5 h-5" strokeWidth={1.75} />
          </button>

          {hasInput ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy}
              title="Send"
              aria-label="Send"
              className="w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition active:scale-95 flex items-center justify-center disabled:opacity-50"
            >
              <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleListen}
              disabled={!canListen || busy}
              title={canListen ? (listening ? "Stop dictation" : "Use voice") : "Voice input is not supported in this browser"}
              aria-label="Use voice"
              className={`w-8 h-8 rounded-lg transition active:scale-95 flex items-center justify-center disabled:opacity-40 ${
                listening ? "bg-violet-600 text-white animate-pulse" : "bg-slate-200 text-slate-900 hover:bg-white"
              }`}
            >
              <AudioLines className="w-4 h-4" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
