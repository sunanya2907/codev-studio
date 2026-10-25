"use client";

import React, { useState } from "react";
import { Globe, Search, Loader2, X, Check } from "lucide-react";

type Result = {
  domain: string;
  available: boolean;
  purchasable: boolean;
  years: number | null;
  priceUsd: number | null;
  renewalUsd: number | null;
  priceInrEstimate: number | null;
};

const money = (n: number | null) => (n === null ? "" : `$${n.toFixed(2)}`);

function Row({ r, onSelect, selected }: { r: Result; onSelect: (d: string) => void; selected: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
        selected ? "border-amber-400 bg-amber-500/10" : "border-slate-800 bg-slate-900/60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white truncate">{r.domain}</div>
        {r.purchasable ? (
          <div className="text-[11px] text-slate-400">
            {money(r.priceUsd)} for {r.years ?? 1} year{(r.years ?? 1) > 1 ? "s" : ""}
            {r.priceInrEstimate !== null && <> (about ₹{r.priceInrEstimate.toLocaleString("en-IN")})</>}
            {r.renewalUsd !== null && <> • renews at {money(r.renewalUsd)}/yr</>}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">
            {r.available ? "Available, but not sold through Build_Core" : "Already registered"}
          </div>
        )}
      </div>
      <span
        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
          r.purchasable
            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
            : "bg-slate-800 text-slate-400 border border-slate-700"
        }`}
      >
        {r.purchasable ? "Available" : r.available ? "Unavailable" : "Taken"}
      </span>
      {r.purchasable && (
        <button
          onClick={() => onSelect(r.domain)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-110"
        >
          {selected ? (
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" /> Selected
            </span>
          ) : (
            "Select"
          )}
        </button>
      )}
    </li>
  );
}

export default function DomainSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [ideas, setIdeas] = useState<Result[] | null>(null);
  const [searched, setSearched] = useState("");
  const [selected, setSelected] = useState("");

  const call = async (suggest: boolean) => {
    const res = await fetch(`/api/domain?name=${encodeURIComponent(query.trim())}${suggest ? "&suggest=true" : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data.code === "VERCEL_NOT_CONFIGURED"
          ? "Domain search is not switched on yet. The site owner needs to add the VERCEL_TOKEN setting."
          : data.error || "Domain search failed."
      );
    }
    return data as { results: Result[]; unsupportedCount: number };
  };

  const search = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError("");
    setResults(null);
    setIdeas(null);
    setSelected("");
    try {
      const data = await call(false);
      setResults(data.results);
      setSearched(query.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Domain search failed.");
    } finally {
      setLoading(false);
    }
  };

  const loadIdeas = async () => {
    setIdeasLoading(true);
    try {
      const data = await call(true);
      setIdeas(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load ideas.");
    } finally {
      setIdeasLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0E1424] border border-slate-800 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-300" /> Find a domain
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="mybrand or mybrand.com"
            className="select-text flex-1 bg-[#0B0F19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-cyan-500 hover:brightness-110 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>

        {error && (
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 mb-4">{error}</p>
        )}

        {loading && <p className="text-xs text-slate-400">Checking live availability and prices…</p>}

        {results && results.length === 0 && (
          <p className="text-xs text-slate-400">No results for that name. Try a different spelling.</p>
        )}

        {results && results.length > 0 && (
          <ul className="space-y-2">
            {results.map((r) => (
              <Row key={r.domain} r={r} onSelect={setSelected} selected={selected === r.domain} />
            ))}
          </ul>
        )}

        {results && results.length > 0 && !ideas && (
          <button
            onClick={loadIdeas}
            disabled={ideasLoading}
            className="mt-4 text-xs font-bold text-cyan-300 hover:text-white disabled:opacity-50"
          >
            {ideasLoading ? "Finding ideas…" : `Need ideas? Show available variations of “${searched}”`}
          </button>
        )}

        {ideas && (
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Available variations</p>
            {ideas.length === 0 ? (
              <p className="text-xs text-slate-400">No available variations found.</p>
            ) : (
              <ul className="space-y-2">
                {ideas.map((r) => (
                  <Row key={r.domain} r={r} onSelect={setSelected} selected={selected === r.domain} />
                ))}
              </ul>
            )}
          </div>
        )}

        {selected && (
          <p className="mt-5 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            You picked <strong>{selected}</strong>. Buying a domain and connecting it to your app is coming in the next
            update, so nothing is charged or reserved yet.
          </p>
        )}

        <p className="text-[11px] text-slate-500 mt-5">
          Availability and prices come live from the domain registrar. Prices are in US dollars per year and can change.
        </p>
      </div>
    </div>
  );
}
