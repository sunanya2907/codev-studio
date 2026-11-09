"use client";
import { useEffect, useRef, useState } from "react";

// Click any icon and a small card explains what it is for. Mounted once in the root layout,
// so every icon in the app is covered without editing each button.
//
// Where the text comes from (first match wins):
//   1. data-help="..." on the icon or on a parent (use this to give one icon a custom text)
//   2. the table below, matched on the lucide icon name (class "lucide-<name>")
//   3. a readable version of the icon name, so a new icon never shows nothing

type Help = { title: string; text: string };

const H = (title: string, text: string): Help => ({ title, text });

// Keys are lucide icon names in kebab-case. Several keys point to one text because lucide
// renames icons between versions (for example Loader2 is now loader-circle).
const TABLE: Record<string, Help> = {};
const add = (names: string[], help: Help) => names.forEach((n) => (TABLE[n] = help));

add(["menu"], H("Menu", "Opens or closes the side panel with your menu and saved projects."));
add(["mic", "microphone"], H("Voice builder", "Talk to the AI with your voice instead of typing. Say what you want to build or change and it answers back. Voice time is paid per minute."));
add(["mic-off"], H("Microphone is off", "The microphone is muted, so the AI can't hear you. Tap it to turn it on again."));
add(["volume-2", "volume"], H("AI voice", "Shows the AI is speaking its answer out loud."));
add(["sparkles"], H("AI", "Marks a feature that uses AI, such as building or improving your app."));
add(["history"], H("History", "Opens your earlier builds so you can reopen or continue a project."));
add(["coins"], H("Tokens", "Your balance. Each build or customization uses tokens. Click to buy more or upgrade your plan."));
add(["lock"], H("Locked", "This is protected. Sign in, accept the terms, or upgrade your plan to use it."));
add(["chevron-left"], H("Previous", "Goes back to the previous item or hides the panel."));
add(["chevron-right"], H("Next", "Goes forward to the next item or opens the panel."));
add(["send"], H("Send", "Sends your message or prompt to the AI so it starts working."));
add(["download"], H("Download", "Downloads your generated app code to your computer as a ZIP file."));
add(["code-xml", "code-2", "code"], H("Code", "Shows the source code the AI wrote for this part of your app."));
add(["eye"], H("Preview", "Shows a live preview of your app so you can see how it looks and works."));
add(["circle-check-big", "check-circle-2", "circle-check", "check-circle"], H("Done", "This step finished successfully."));
add(["check"], H("Confirmed", "Means selected, included in your plan, or completed."));
add(["layers"], H("Spec / Architecture", "The requirements document (SRS) that the other AI agents build from."));
add(["panels-top-left", "layout", "layout-dashboard"], H("Frontend", "The screens and design of your app: what users see and click."));
add(["server"], H("Backend", "The server code and API routes that make your app work behind the scenes."));
add(["database"], H("Database", "The database schema: where your app stores its data."));
add(["shield-check", "shield"], H("Quality & security", "The QA agent reviewed your code for bugs and security problems. Also marks the terms and safety information."));
add(["copy"], H("Copy", "Copies this text or code to your clipboard."));
add(["zap"], H("Fast", "Highlights a quick or powerful feature."));
add(["plus"], H("Add", "Adds something new, like extra tokens."));
add(["x", "close"], H("Close", "Closes this window or clears the current item."));
add(["crown"], H("Premium plan", "A paid plan with more tokens and extra features."));
add(["file-text", "file"], H("Document", "The written requirements (SRS) for your app."));
add(["globe"], H("Domain", "Search for a web address (domain name) for your app and check if it is free."));
add(["search"], H("Search", "Searches for what you typed."));
add(["arrow-right"], H("Continue", "Takes you to the next step or page."));
add(["mail"], H("Email", "Sign in or contact us with an email address."));
add(["clock"], H("Waiting", "This step is waiting its turn or still running."));
add(["triangle-alert", "alert-triangle", "circle-alert"], H("Problem", "Something went wrong in this step. Your token is returned if a build fails."));
add(["loader-circle", "loader-2", "loader"], H("Loading", "Working on it. Please wait a moment."));

const GOOGLE = H("Google", "Sign in with your Google account. No new password needed.");

const pretty = (n: string) => n.replace(/-\d+$/, "").replace(/-/g, " ");

function lookup(svg: Element): Help | null {
  const custom = svg.closest("[data-help]")?.getAttribute("data-help");
  if (custom) {
    const [title, ...rest] = custom.split("|");
    return rest.length ? H(title.trim(), rest.join("|").trim()) : H("What this does", custom);
  }
  const cls = Array.from(svg.classList).find((c) => c.startsWith("lucide-") && c !== "lucide");
  if (!cls) return null;
  const name = cls.slice("lucide-".length);
  return TABLE[name] ?? H(pretty(name).replace(/^./, (c) => c.toUpperCase()), `This icon stands for "${pretty(name)}".`);
}

type Card = { id: number; left: number; top: number; help: Help; hint: string };

export default function IconHelp() {
  const [card, setCard] = useState<Card | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const counter = useRef(0);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      setCard(null);
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const svg = target?.closest?.("svg");
      if (!svg || svg.closest("[data-icon-help-card]")) return hide();

      const help = lookup(svg) ?? (svg.closest("button, a") ? GOOGLE : null);
      if (!help) return hide();

      // The button's own title / aria-label is often more specific (e.g. the token price).
      const holder = svg.closest("[title], [aria-label]");
      const hint = (holder?.getAttribute("title") || holder?.getAttribute("aria-label") || "").trim();

      const r = svg.getBoundingClientRect();
      const width = Math.min(272, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8));
      const below = r.bottom + 8;
      const top = below + 120 > window.innerHeight ? Math.max(8, r.top - 8 - 110) : below;

      clearTimeout(timer.current);
      const id = ++counter.current;
      setCard((cur) => (cur && cur.help.title === help.title && Math.abs(cur.left - left) < 2 && Math.abs(cur.top - top) < 2 ? null : { id, left, top, help, hint: hint === help.title ? "" : hint }));
      timer.current = setTimeout(hide, 6000);
    };

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      clearTimeout(timer.current);
    };
  }, []);

  if (!card) return null;
  return (
    <div
      key={card.id}
      data-icon-help-card
      role="status"
      aria-live="polite"
      style={{ left: card.left, top: card.top, width: Math.min(272, (typeof window !== "undefined" ? window.innerWidth : 320) - 16) }}
      className="pointer-events-none fixed z-[100] rounded-xl border border-neutral-700 bg-neutral-900/95 p-3 text-left shadow-xl backdrop-blur"
    >
      <p className="text-sm font-semibold text-white">{card.help.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-300">{card.help.text}</p>
      {card.hint && <p className="mt-2 border-t border-neutral-800 pt-2 text-[11px] text-neutral-500">{card.hint}</p>}
    </div>
  );
}
