"use client";
// "Push to GitHub" window: the person pastes a GitHub token once, picks a repository name and the whole project
// (the same files as Export ZIP) is pushed to a new repository in THEIR GitHub account. They can then deploy it anywhere.
import React, { useState } from "react";
import { ExternalLink, Github, Loader2, X } from "lucide-react";

type F = { path: string; content: string };

export default function GithubPush({
  getFiles,
  defaultName,
  onClose,
  onLocked,
}: {
  getFiles: () => F[];
  defaultName: string;
  onClose: () => void;
  onLocked: () => void; // free plan: open the pricing window
}) {
  const [token, setToken] = useState("");
  const [name, setName] = useState(defaultName);
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ url: string; files: number; isPrivate: boolean } | null>(null);

  const push = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, repoName: name, isPrivate, files: getFiles() }),
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: res.status === 413 ? "The project is too large to push in one go." : "The server did not answer. Please try again." };
      }
      if (!res.ok) {
        if (data.code === "PLAN_LOCKED") {
          onClose();
          onLocked();
          return;
        }
        throw new Error(data.error || "The push failed.");
      }
      setDone(data);
      setToken("");
    } catch (e: any) {
      setError(e?.message || "The push failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-text" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl bg-[#0D1322] border border-slate-700 shadow-2xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Github className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">Push to GitHub</h2>
              <p className="text-xs text-slate-400">Then deploy it on any host you like.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm font-bold text-emerald-300">Done! {done.files} files are on GitHub.</p>
              <a href={done.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-sm text-emerald-200 underline break-all">
                {done.url} <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            </div>
            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              <p className="font-semibold text-white">Host it anywhere. The repository already contains everything hosts need.</p>
              {!done.isPrivate ? (
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`https://vercel.com/new/clone?repository-url=${encodeURIComponent(done.url)}&env=DATABASE_URL,SESSION_SECRET,ADMIN_EMAIL`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-center px-3 py-2 rounded-lg bg-white text-slate-900 font-bold hover:bg-slate-200 transition"
                  >
                    Deploy on Vercel
                  </a>
                  <a
                    href={`https://render.com/deploy?repo=${encodeURIComponent(done.url)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-center px-3 py-2 rounded-lg bg-slate-700 text-white font-bold hover:bg-slate-600 transition"
                  >
                    Deploy on Render
                  </a>
                </div>
              ) : (
                <p className="text-slate-400">The repository is private, so on the host choose &quot;import from GitHub&quot; and allow access to it.</p>
              )}
              <ul className="list-disc pl-5 space-y-1 text-slate-400">
                <li><b className="text-slate-200">Railway, Netlify, Cloudflare</b>: import the repository.</li>
                <li><b className="text-slate-200">Hostinger, GoDaddy, DigitalOcean, AWS (VPS)</b>: <code className="text-cyan-300">docker compose up -d --build</code> runs the website and its database.</li>
                <li><b className="text-slate-200">Hostinger / GoDaddy Node.js plans</b>: connect the repository, build <code className="text-cyan-300">npm run build</code>, start <code className="text-cyan-300">npm run start</code>. Ordinary shared hosting cannot run this site.</li>
              </ul>
              <p className="text-slate-400">
                Every host needs 3 settings: <code className="text-cyan-300">DATABASE_URL</code> (a free PostgreSQL such as Neon), <code className="text-cyan-300">SESSION_SECRET</code> (long random text) and <code className="text-cyan-300">ADMIN_EMAIL</code> (your email). The tables and the admin account are created automatically. Open <code className="text-cyan-300">/admin/login</code> to sign in. The file <b>DEPLOY.md</b> in the repository has the steps for each host.
              </p>
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-bold text-white transition">
              Close
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300">GitHub token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-lg bg-[#0B0F19] border border-slate-700 focus:border-violet-500 outline-none px-3 py-2 text-base sm:text-sm text-white placeholder-slate-600"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=Build_Core"
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-300 underline"
                >
                  Create a token here
                </a>{" "}
                (one click: scroll down and press &quot;Generate token&quot;, the &quot;repo&quot; box is already ticked), then paste it. It is used for this push only and is never saved.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300">Repository name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\s+/g, "-"))}
                maxLength={100}
                className="mt-1 w-full rounded-lg bg-[#0B0F19] border border-slate-700 focus:border-violet-500 outline-none px-3 py-2 text-base sm:text-sm text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="accent-violet-500" />
              Keep the repository private
            </label>
            {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</p>}
            <button
              onClick={push}
              disabled={busy || !token.trim() || !name.trim()}
              className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-bold text-white transition flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              {busy ? "Pushing..." : "Push to GitHub"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
