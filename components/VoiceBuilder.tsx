"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Volume2, Loader2, Sparkles } from "lucide-react";
import { VOICE_PRICE_CENTS_PER_MIN, VOICE_SECONDS_PER_TOKEN } from "@/lib/plans";

// Talk to the AI to describe your app. The browser does speech-to-text and text-to-speech
// (free, no extra keys); the server does the AI turns and bills the time (see lib/voice.ts).

type Msg = { role: "user" | "assistant"; text: string };
type Phase = "idle" | "starting" | "listening" | "thinking" | "speaking" | "ended";

const TICK_MS = 10_000; // billing heartbeat; the server enforces a 45 s maximum silence
const LANGS = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (US)" },
  { code: "hi-IN", label: "हिन्दी" },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export default function VoiceBuilder({
  open,
  onClose,
  onApply,
  onBalanceChange,
  onNeedTokens,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (prompt: string) => void;
  onBalanceChange: (tokenBalance: number) => void;
  onNeedTokens: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [interim, setInterim] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const [lang, setLang] = useState("en-IN");
  const [supported, setSupported] = useState(true);

  const sessionRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const messagesRef = useRef<Msg[]>([]);
  const recRef = useRef<any>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition) && "speechSynthesis" in window);
  }, []);

  const stopRecognition = () => {
    try {
      recRef.current?.abort?.();
    } catch {}
    recRef.current = null;
  };

  const stopTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
    tickRef.current = null;
    clockRef.current = null;
  };

  const finishSession = useCallback(async (keepalive = false) => {
    const id = sessionRef.current;
    sessionRef.current = null;
    stopTimers();
    stopRecognition();
    window.speechSynthesis?.cancel();
    if (!id) return;
    try {
      await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", sessionId: id }),
        keepalive,
      });
    } catch {}
  }, []);

  // Stop billing if the panel closes, the tab closes or the component unmounts.
  useEffect(() => {
    const onHide = () => void finishSession(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void finishSession(true);
    };
  }, [finishSession]);

  const endWith = (message: string) => {
    void finishSession();
    setError(message);
    setPhaseBoth("ended");
  };

  const speak = (text: string, then: () => void) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langRef.current;
    let done = false;
    const next = () => {
      if (done) return;
      done = true;
      then();
    };
    u.onend = next;
    u.onerror = next;
    setPhaseBoth("speaking");
    synth.speak(u);
    // Some browsers never fire onend for long text; don't get stuck.
    setTimeout(next, Math.min(30_000, text.length * 90 + 4000));
  };

  const listen = useCallback(() => {
    if (!sessionRef.current) return;
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = langRef.current;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    recRef.current = rec;

    rec.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        endWith("Microphone access was blocked. Allow the microphone in your browser and try again.");
      }
      // "no-speech" / "aborted": handled by onend
    };
    rec.onend = () => {
      setInterim("");
      if (recRef.current !== rec) return; // we aborted it on purpose
      recRef.current = null;
      if (!sessionRef.current) return;
      if (finalText.trim()) void sendTurn(finalText.trim());
      else if (phaseRef.current === "listening") setTimeout(listen, 250); // keep listening
    };

    setPhaseBoth("listening");
    try {
      rec.start();
    } catch {
      setTimeout(listen, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendTurn = async (text: string) => {
    const id = sessionRef.current;
    if (!id) return;
    setPhaseBoth("thinking");
    const history = messagesRef.current;
    const withUser: Msg[] = [...history, { role: "user", text }];
    messagesRef.current = withUser;
    setMessages(withUser);

    try {
      const res = await fetch("/api/voice/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, transcript: text, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "VOICE_EXHAUSTED") return endWith("Your voice time is used up. Continue to use 1 more token (4 more minutes).");
        if (data.code === "VOICE_SESSION_ENDED") return endWith("The voice session ended. Please start again.");
        setError(data.error || "Something went wrong. Please try again.");
        if (sessionRef.current) listen();
        return;
      }
      if (typeof data.remainingSeconds === "number") setRemaining(data.remainingSeconds);
      const reply: string = data.reply || "Sorry, could you say that again?";
      const withReply: Msg[] = [...withUser, { role: "assistant", text: reply }];
      messagesRef.current = withReply;
      setMessages(withReply);
      setError("");
      speak(reply, () => {
        if (sessionRef.current) listen();
      });
    } catch {
      setError("Network problem. Please try again.");
      if (sessionRef.current) listen();
    }
  };

  const start = async () => {
    setError("");
    setPhaseBoth("starting");
    try {
      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "OUT_OF_TOKENS") {
          setError(data.error);
          setPhaseBoth("idle");
          onNeedTokens();
          return;
        }
        setError(data.error || "Could not start voice.");
        setPhaseBoth("idle");
        return;
      }
      sessionRef.current = data.sessionId;
      setRemaining(data.voiceSeconds);
      onBalanceChange(data.tokenBalance);

      // Billing heartbeat + a local countdown for the display.
      tickRef.current = setInterval(async () => {
        const sid = sessionRef.current;
        if (!sid) return;
        try {
          const r = await fetch("/api/voice/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "tick", sessionId: sid }),
          });
          const t = await r.json().catch(() => ({}));
          if (t.state === "active") setRemaining(t.remainingSeconds);
          else if (t.state === "exhausted") endWith("Your voice time is used up. Continue to use 1 more token (4 more minutes).");
          else if (t.state === "expired" || t.state === "inactive") endWith("The voice session ended. Please start again.");
        } catch {}
      }, TICK_MS);
      clockRef.current = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);

      // Greeting (spoken locally, free), then listen.
      const greeting =
        messagesRef.current.length === 0
          ? "Hi! Tell me about the app or website you want to build."
          : "Okay, I'm listening. Go on.";
      if (messagesRef.current.length === 0) {
        const m: Msg[] = [{ role: "assistant", text: greeting }];
        messagesRef.current = m;
        setMessages(m);
      }
      speak(greeting, () => listen());
    } catch {
      setError("Network problem. Please try again.");
      setPhaseBoth("idle");
    }
  };

  const useForApp = async () => {
    const userTexts = messagesRef.current.filter((m) => m.role === "user").map((m) => m.text);
    if (userTexts.length === 0) return;
    stopRecognition();
    window.speechSynthesis?.cancel();
    setPhaseBoth("thinking");
    let brief = userTexts.join(". ").slice(0, 500); // fallback if the summary call fails
    const id = sessionRef.current;
    if (id) {
      try {
        const res = await fetch("/api/voice/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id, finalize: true, history: messagesRef.current }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.brief) brief = data.brief;
      } catch {}
    }
    await finishSession();
    onApply(brief.slice(0, 500));
    setPhaseBoth("idle");
    onClose();
  };

  const close = () => {
    void finishSession();
    setPhaseBoth("idle");
    onClose();
  };

  if (!open) return null;

  const active = phase === "listening" || phase === "thinking" || phase === "speaking";
  const price = (VOICE_PRICE_CENTS_PER_MIN / 100).toFixed(2);
  const canUse = messages.some((m) => m.role === "user");

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0E1424] border border-slate-800 rounded-3xl p-6 shadow-2xl select-text">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Mic className="w-5 h-5 text-cyan-400" /> Talk to build
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              ${price}/min · 1 token = {VOICE_SECONDS_PER_TOKEN / 60} minutes · unused time is kept
            </p>
          </div>
          <button onClick={close} className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!supported ? (
          <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            Voice needs speech recognition, which works in Google Chrome, Microsoft Edge and Safari. Please open the site in one of those browsers.
          </p>
        ) : (
          <>
            <div className="h-56 overflow-y-auto rounded-2xl bg-[#090D16] border border-slate-800 p-3 space-y-2 mb-3">
              {messages.length === 0 && (
                <p className="text-xs text-slate-500 text-center mt-16">
                  Press Start and describe your idea out loud. The assistant will ask a few questions, then you can use the result as your app description.
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${m.role === "user" ? "bg-violet-600/30 text-violet-100" : "bg-slate-800 text-slate-200"}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {interim && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] px-3 py-2 rounded-2xl text-xs bg-violet-600/10 text-violet-300 italic">{interim}</div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs mb-3">
              <span className="flex items-center gap-2 text-slate-300">
                {phase === "listening" && <><Mic className="w-4 h-4 text-emerald-400 animate-pulse" /> Listening...</>}
                {phase === "thinking" && <><Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> Thinking...</>}
                {phase === "speaking" && <><Volume2 className="w-4 h-4 text-cyan-400" /> Speaking...</>}
                {phase === "starting" && <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>}
                {(phase === "idle" || phase === "ended") && <><MicOff className="w-4 h-4 text-slate-500" /> Not listening</>}
              </span>
              {active && (
                <span className={`font-mono font-bold ${remaining <= 30 ? "text-rose-400" : "text-amber-300"}`}>
                  {fmt(remaining)} left
                </span>
              )}
            </div>

            {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5 mb-3">{error}</p>}

            <div className="flex flex-wrap items-center gap-2">
              {!active && phase !== "starting" && (
                <>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-200"
                  >
                    {LANGS.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={start}
                    className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-violet-600 to-cyan-500 hover:brightness-110"
                  >
                    {phase === "ended" ? "Continue (uses 1 token if needed)" : messages.length ? "Resume" : "Start talking"}
                  </button>
                </>
              )}
              {active && (
                <button onClick={() => void finishSession().then(() => setPhaseBoth("idle"))} className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700">
                  Stop
                </button>
              )}
              {canUse && phase !== "starting" && phase !== "thinking" && (
                <button onClick={useForApp} className="flex-1 py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-110 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Use this for my app
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
