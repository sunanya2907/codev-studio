"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { ADVANCED_BUILD_COST, BUILD_COST } from "@/lib/plans";

export type BuildQuestion = { id: string; question: string; options: string[] };

type Props = {
  open: boolean;
  idea: string;
  questions: BuildQuestion[];
  /** Advanced mode: open website questions answered in full sentences, costs ADVANCED_BUILD_COST tokens. */
  advanced?: boolean;
  onCancel: () => void;
  onSubmit: (answers: { question: string; answer: string }[]) => void;
};

export default function BuildQuestions({ open, idea, questions, advanced = false, onCancel, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // New set of questions (quick or advanced): start with empty answers.
  useEffect(() => {
    setAnswers({});
  }, [questions, advanced]);
  if (!open) return null;

  const maxLen = advanced ? 400 : 120;
  const cost = advanced ? ADVANCED_BUILD_COST : BUILD_COST;
  const set = (id: string, v: string) => setAnswers((p) => ({ ...p, [id]: v }));
  const submit = () =>
    onSubmit(
      questions.map((q) => ({ question: q.question, answer: (answers[q.id] || "").trim() })).filter((a) => a.answer)
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0B0F19] border border-slate-800 shadow-2xl p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            {advanced ? `${questions.length} advanced website questions` : "3 quick questions"}
          </h2>
          <button onClick={onCancel} aria-label="Close" className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          So we build exactly what you need for: <span className="text-slate-200">{idea.slice(0, 80)}</span>
        </p>
        {advanced && (
          <p className="text-[11px] text-violet-300/90 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2 -mt-2 mb-5">
            Answer in your own words (pages, admin and user roles, login, data, rules). Tap an example to start from it,
            then edit it. The more detail you give, the closer the website is to what you imagine. Leave a question empty to
            let the AI decide.
          </p>
        )}

        <div className="space-y-5">
          {questions.map((q, i) => (
            <div key={q.id}>
              <p className="text-sm font-bold text-white mb-2">
                {i + 1}. {q.question}
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {q.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => set(q.id, o)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      answers[q.id] === o
                        ? "bg-violet-600 border-violet-500 text-white"
                        : "bg-slate-900 border-slate-700 text-slate-300 hover:border-violet-500"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
              {advanced ? (
                <textarea
                  value={answers[q.id] || ""}
                  onChange={(e) => set(q.id, e.target.value.slice(0, maxLen))}
                  rows={3}
                  placeholder="Type your answer in detail..."
                  className="w-full resize-y bg-[#090D16] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              ) : (
                <input
                  value={answers[q.id] || ""}
                  onChange={(e) => set(q.id, e.target.value.slice(0, maxLen))}
                  placeholder="Or type your own answer..."
                  className="w-full bg-[#090D16] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => (advanced ? onCancel() : onSubmit([]))}
            className="text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            {advanced ? "Cancel" : "Skip & build now"}
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:brightness-110 transition shadow-lg shadow-violet-600/30 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Build my app ({cost} Tokens)
          </button>
        </div>
      </div>
    </div>
  );
}
