"use client";
// "+ image / file" button with small previews. Used next to the Customize box of every agent.
import React, { useRef } from "react";
import { FileText, ImagePlus, X } from "lucide-react";
import { ACCEPT, MAX_FILES, readFiles, type Attached } from "@/lib/attachments-client";

export function AttachChips({ files, onRemove }: { files: Attached[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, i) => (
        <div key={i} className="relative flex items-center gap-1.5 max-w-[11rem] rounded-lg bg-slate-800/80 border border-slate-700 pl-1 pr-6 py-0.5 text-[11px] text-slate-200">
          {f.preview ? <img src={f.preview} alt="" className="w-6 h-6 rounded object-cover" /> : <FileText className="w-4 h-4 text-slate-400 shrink-0 ml-0.5" />}
          <span className="truncate">{f.name}</span>
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function AttachButton({
  files,
  onChange,
  disabled,
}: {
  files: Attached[];
  onChange: (next: Attached[]) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        onChange={async (e) => {
          const picked = e.target.files;
          if (!picked) return;
          const { files: added, problems } = await readFiles(picked, MAX_FILES - files.length);
          if (problems.length) alert(problems.join("\n"));
          if (added.length) onChange([...files, ...added].slice(0, MAX_FILES));
          if (ref.current) ref.current.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled || files.length >= MAX_FILES}
        title="Add an image or file"
        aria-label="Add an image or file"
        className="relative p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition shrink-0 disabled:opacity-40"
      >
        <ImagePlus className="w-3.5 h-3.5" />
        {files.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-violet-600 text-[9px] font-bold text-white flex items-center justify-center">{files.length}</span>
        )}
      </button>
    </>
  );
}