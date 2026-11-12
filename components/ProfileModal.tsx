"use client";

import React, { useState } from "react";
import { X, Check } from "lucide-react";

export type Profile = { name: string; email: string; image: string | null };

/** Round profile picture: the photo if there is one, otherwise the first letter of the name. */
export function Avatar({ name, image, size = 28 }: { name: string; image?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const box = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) };
  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={box}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      style={box}
      className="rounded-full bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center font-bold text-white shrink-0"
    >
      {letter}
    </div>
  );
}

type Props = {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onSaved: (p: Profile) => void;
};

export default function ProfileModal({ open, profile, onClose, onSaved }: Props) {
  const [name, setName] = useState(profile.name);
  const [image, setImage] = useState(profile.image || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, image: image.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.user) throw new Error(data?.error || "Could not save your profile.");
      onSaved({ name: data.user.name || "", email: data.user.email, image: data.user.image || null });
      setDone(true);
      setTimeout(onClose, 600);
    } catch (e: any) {
      setError(e.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#0B0F19] border border-slate-800 shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold text-white">Your profile</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Avatar name={name || profile.name} image={image.trim() || null} size={52} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{name || profile.name}</p>
            <p className="text-xs text-slate-400 truncate">{profile.email}</p>
          </div>
        </div>

        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Display name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          className="w-full mb-3 bg-[#090D16] border border-slate-800 rounded-lg px-3 py-2 text-base sm:text-xs text-white focus:outline-none focus:border-violet-500"
        />

        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Photo link (optional, https://...)</label>
        <input
          value={image}
          onChange={(e) => setImage(e.target.value.slice(0, 500))}
          placeholder="https://..."
          className="w-full mb-3 bg-[#090D16] border border-slate-800 rounded-lg px-3 py-2 text-base sm:text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
        />

        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Email (cannot be changed)</label>
        <input
          value={profile.email}
          readOnly
          className="w-full mb-4 bg-[#090D16]/60 border border-slate-800 rounded-lg px-3 py-2 text-base sm:text-xs text-slate-500"
        />

        {error && <p className="mb-3 text-xs text-rose-300">{error}</p>}

        <button
          onClick={save}
          disabled={saving || name.trim().length < 2}
          className="w-full h-10 rounded-lg font-bold text-xs uppercase tracking-wide text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:brightness-110 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {done ? (
            <>
              <Check className="w-4 h-4" /> Saved
            </>
          ) : saving ? (
            "Saving..."
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </div>
  );
}
