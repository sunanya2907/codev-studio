"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { isQaPending } from "@/lib/qa-review";
import { useRouter } from "next/navigation";
import ProfileModal, { Avatar, type Profile } from "@/components/ProfileModal";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { buildPreviewHtml } from "@/lib/preview";
import { parseFiles, cleanPath } from "@/lib/files";
import { scaffoldFiles } from "@/lib/scaffold";
import {
  TIER_TOKENS,
  CUSTOMIZE_COST,
  ADVANCED_BUILD_COST,
  BUILD_COST,
  STANDARD_PRICE_LABEL,
  PRO_PRICE_LABEL,
  FREE_TRIAL_BUILDS,
  VOICE_PRICE_LABEL,
  VOICE_TOKEN_LABEL,
  TOKEN_PRICE_CENTS,
  TOKEN_PRICE_LABEL,
  usd,
} from "@/lib/plans";
import { startCheckout, contactForExclusive } from "@/lib/billing-client";
import PaymentMethodToggle from "@/components/PaymentMethodToggle";
import { PLAN_DETAILS } from "@/lib/plan-details";
import BuildProgress, { IDLE_STATUSES, type AgentStatuses } from "@/components/BuildProgress";
import VoiceBuilder, { type ApplyResult } from "@/components/VoiceBuilder";
import FlowView from "@/components/FlowView";
import AttachButton, { AttachChips } from "@/components/AttachButton";
import { toPayload, type Attached } from "@/lib/attachments-client";
import BuildQuestions, { type BuildQuestion } from "@/components/BuildQuestions";
import type { PaymentProvider } from "@/lib/plans";
import {
  Menu,
  Mic,
  Sparkles,
  History,
  Coins,
  Lock,
  ChevronLeft,
  ChevronRight,
  Send,
  Download,
  Code2,
  Eye,
  CheckCircle2,
  Layers,
  Layout,
  Server,
  Database,
  ShieldCheck,
  GitBranch,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Plus,
  X,
  Crown,
  Globe,
  Wand2,
  LogOut,
  MessageSquarePlus,
  Settings,
  FileText,
  ChevronDown,
} from "lucide-react";

// GoDaddy links for the sidebar "Domain & Hosting" plugin.
// The steps shown when someone clicks the globe ("Make your website online") at the bottom of the sidebar.
// "Complete step" on a step opens that step's list of choices (at least 5): the user picks the one they
// prefer with "Select this", which opens that provider's website in a new tab.
type StepOption = { id: string; name: string; text: string; host: string; url: string };
const opt = (id: string, name: string, text: string, host: string, url: string): StepOption => ({ id, name, text, host, url });

const DOMAIN_STEPS: { title: string; text: string; options: StepOption[] }[] = [
  {
    title: "Domain Registration",
    text: "Purchase a domain name, such as example.com, from GoDaddy or Namecheap.",
    options: [
      opt("godaddy", "GoDaddy", "Largest global domain registrar", "godaddy.com", "https://www.godaddy.com/domains"),
      opt("namecheap", "Namecheap", "Domains, hosting and SSL", "namecheap.com", "https://www.namecheap.com"),
      opt("dynadot", "Dynadot", "Domain registration and management", "dynadot.com", "https://www.dynadot.com"),
      opt("squarespace", "Squarespace", "Domains and website building", "squarespace.com/domains", "https://www.squarespace.com/domains"),
      opt("hostinger", "Hostinger", "Domains, hosting and website building", "hostinger.com", "https://www.hostinger.com"),
    ],
  },
  {
    title: "Choose a Hosting Server",
    text: "Select where your website will run: VPS, dedicated server, cloud hosting or shared hosting.",
    options: [
      opt("hostinger", "Hostinger", "Shared, cloud and VPS hosting at low prices", "hostinger.com", "https://www.hostinger.com"),
      opt("digitalocean", "DigitalOcean", "Simple cloud servers for developers", "digitalocean.com", "https://www.digitalocean.com"),
      opt("aws", "Amazon Web Services", "The largest cloud platform, servers of any size", "aws.amazon.com", "https://aws.amazon.com"),
      opt("vultr", "Vultr", "Cloud and bare-metal servers in many locations", "vultr.com", "https://www.vultr.com"),
      opt("linode", "Linode (Akamai)", "Cloud VPS with straightforward pricing", "linode.com", "https://www.linode.com"),
      opt("hetzner", "Hetzner", "Low-cost dedicated and cloud servers", "hetzner.com", "https://www.hetzner.com"),
    ],
  },
  {
    title: "Server Configuration",
    text: "Configure the operating system, CPU, RAM, storage, firewall and required software.",
    options: [
      opt("ubuntu", "Ubuntu Server", "Official guides for setting up a Linux server", "ubuntu.com/server", "https://ubuntu.com/server"),
      opt("do-tutorials", "DigitalOcean Tutorials", "Step-by-step server setup and security guides", "digitalocean.com/community/tutorials", "https://www.digitalocean.com/community/tutorials"),
      opt("cpanel", "cPanel", "Popular control panel to manage a server with clicks", "cpanel.net", "https://www.cpanel.net"),
      opt("plesk", "Plesk", "Control panel for sites, email and security", "plesk.com", "https://www.plesk.com"),
      opt("coolify", "Coolify", "Self-hosted panel to run apps on your own server", "coolify.io", "https://coolify.io"),
      opt("webmin", "Webmin", "Free web-based tool to administer a Linux server", "webmin.com", "https://webmin.com"),
    ],
  },
  {
    title: "Upload / Deploy Website",
    text: "Upload your website files or deploy your application from GitHub.",
    options: [
      opt("github", "GitHub", "Store your code and connect it to a host", "github.com", "https://github.com"),
      opt("vercel", "Vercel", "Deploy Next.js apps straight from GitHub", "vercel.com", "https://vercel.com"),
      opt("netlify", "Netlify", "Deploy sites and apps from Git in minutes", "netlify.com", "https://www.netlify.com"),
      opt("render", "Render", "Host web apps, APIs and databases", "render.com", "https://render.com"),
      opt("railway", "Railway", "Deploy apps and databases with little setup", "railway.com", "https://railway.com"),
      opt("cf-pages", "Cloudflare Pages", "Free hosting for fast static and full-stack sites", "pages.cloudflare.com", "https://pages.cloudflare.com"),
    ],
  },
  {
    title: "Connect Domain (DNS)",
    text: "Point your domain to your hosting server using DNS records.",
    options: [
      opt("cloudflare", "Cloudflare", "Fast, free DNS with extra protection", "cloudflare.com", "https://www.cloudflare.com"),
      opt("godaddy-dns", "GoDaddy DNS", "Manage records where you bought the domain", "godaddy.com", "https://www.godaddy.com"),
      opt("namecheap-dns", "Namecheap DNS", "Manage records from your Namecheap account", "namecheap.com", "https://www.namecheap.com"),
      opt("route53", "Amazon Route 53", "Reliable DNS from Amazon Web Services", "aws.amazon.com/route53", "https://aws.amazon.com/route53"),
      opt("gcloud-dns", "Google Cloud DNS", "Managed DNS on Google's network", "cloud.google.com/dns", "https://cloud.google.com/dns"),
      opt("dnsimple", "DNSimple", "Easy DNS management with clear tools", "dnsimple.com", "https://dnsimple.com"),
    ],
  },
  {
    title: "Configure SSL Certificate",
    text: "Install SSL so your website uses HTTPS securely.",
    options: [
      opt("letsencrypt", "Let's Encrypt", "Free, automatic HTTPS certificates", "letsencrypt.org", "https://letsencrypt.org"),
      opt("zerossl", "ZeroSSL", "Free and paid certificates with an easy dashboard", "zerossl.com", "https://zerossl.com"),
      opt("cf-ssl", "Cloudflare SSL", "HTTPS for your site when you use Cloudflare", "cloudflare.com/ssl", "https://www.cloudflare.com/ssl"),
      opt("digicert", "DigiCert", "Paid certificates for businesses", "digicert.com", "https://www.digicert.com"),
      opt("sectigo", "Sectigo", "Paid certificates with wide browser support", "sectigo.com", "https://www.sectigo.com"),
      opt("sslcom", "SSL.com", "Certificates for sites, email and code", "ssl.com", "https://www.ssl.com"),
    ],
  },
  {
    title: "Database and Backend Configuration",
    text: "Connect databases, APIs, authentication and backend services, if required.",
    options: [
      opt("supabase", "Supabase", "PostgreSQL database with login and storage", "supabase.com", "https://supabase.com"),
      opt("neon", "Neon", "Serverless PostgreSQL that scales to zero", "neon.com", "https://neon.com"),
      opt("planetscale", "PlanetScale", "Managed MySQL and Postgres databases", "planetscale.com", "https://planetscale.com"),
      opt("mongodb", "MongoDB Atlas", "Hosted MongoDB database in the cloud", "mongodb.com/atlas", "https://www.mongodb.com/atlas"),
      opt("firebase", "Firebase", "Google's database, login and backend tools", "firebase.google.com", "https://firebase.google.com"),
      opt("appwrite", "Appwrite", "Open-source backend with auth and databases", "appwrite.io", "https://appwrite.io"),
    ],
  },
  {
    title: "Testing and Launch",
    text: "Test performance, security, mobile responsiveness and availability before launching.",
    options: [
      opt("pagespeed", "PageSpeed Insights", "Google's speed and mobile test for your page", "pagespeed.web.dev", "https://pagespeed.web.dev"),
      opt("gtmetrix", "GTmetrix", "Speed reports with clear fixes", "gtmetrix.com", "https://gtmetrix.com"),
      opt("webpagetest", "WebPageTest", "Detailed load tests from many locations", "webpagetest.org", "https://www.webpagetest.org"),
      opt("ssllabs", "Qualys SSL Labs", "Checks your HTTPS and server security", "ssllabs.com", "https://www.ssllabs.com/ssltest"),
      opt("gsc", "Google Search Console", "Get your site indexed and watch its health", "search.google.com/search-console", "https://search.google.com/search-console"),
      opt("pingdom", "Pingdom", "Monitors that your site stays online", "pingdom.com", "https://www.pingdom.com"),
    ],
  },
];

// Providers that cover most steps in one account (domain, hosting, DNS, HTTPS, deploy). Shown below the steps.
const ALL_IN_ONE: StepOption[] = [
  opt("hostinger", "Hostinger", "Domain, hosting and free HTTPS in one account", "hostinger.com", "https://www.hostinger.com"),
  opt("godaddy", "GoDaddy", "Domains, hosting, SSL certificates and DNS together", "godaddy.com", "https://www.godaddy.com"),
  opt("namecheap", "Namecheap", "Domains, hosting, SSL and DNS from one dashboard", "namecheap.com", "https://www.namecheap.com"),
  opt("vercel", "Vercel", "Deploy from GitHub, buy a domain, automatic HTTPS, add a database", "vercel.com", "https://vercel.com"),
  opt("cloudflare", "Cloudflare", "Domain at cost, DNS, HTTPS and Pages hosting", "cloudflare.com", "https://www.cloudflare.com"),
  opt("netlify", "Netlify", "Deploy from Git, custom domains and HTTPS built in", "netlify.com", "https://www.netlify.com"),
];

interface HistoryItem {
  id: string;
  prompt: string;
  spec: string;
  frontend: string;
  backend: string;
  database: string;
  qa?: string;
  flow?: string | null; // pseudocode & flowchart
  createdAt: string;
  status?: string; // BUILDING | DONE | FAILED
  error?: string | null;
}

// What a free user sees instead of code. The real code never reaches the editor box.
const LOCKED_TEXT = "// Locked on Free Plan.\n// Your Live Preview works. Upgrade to view, copy, edit and export the code.";

const AGENTS = [
  {
    id: 1,
    key: "spec",
    name: "Agent 1",
    role: "SRS Document",
    badgeColor: "from-violet-600 to-indigo-600",
    icon: Layers,
    placeholder: "Ask Agent 1 to change the SRS (requirements, data model, API)...",
    buttonLabel: "Customize SRS",
    freeAccessible: false,
  },
  {
    id: 2,
    key: "frontend",
    name: "Agent 2",
    role: "Frontend UI",
    badgeColor: "from-blue-600 to-cyan-500",
    icon: Layout,
    placeholder: "Ask Agent 2 to change pages or components...",
    buttonLabel: "Customize UI",
    freeAccessible: false,
  },
  {
    id: 3,
    key: "backend",
    name: "Agent 3",
    role: "Backend API",
    badgeColor: "from-emerald-600 to-teal-500",
    icon: Server,
    placeholder: "Ask Agent 3 to change or add API routes...",
    buttonLabel: "Customize API",
    freeAccessible: false,
  },
  {
    id: 4,
    key: "database",
    name: "Agent 4",
    role: "Database Schema",
    badgeColor: "from-amber-500 to-orange-500",
    icon: Database,
    placeholder: "Ask Agent 4 to update Prisma/SQL schema...",
    buttonLabel: "Customize DB",
    freeAccessible: false,
  },
  {
    id: 5,
    key: "qa",
    name: "Agent 5",
    role: "Security & Deploy QA",
    badgeColor: "from-pink-600 to-rose-500",
    icon: ShieldCheck,
    placeholder: "Ask Agent 5 to audit security & deployment...",
    buttonLabel: "Customize QA",
    freeAccessible: false,
  },
  {
    id: 6,
    key: "flow",
    name: "Pseudocode & Flowchart",
    role: "", // not one of the 5 agents: shown under its own name
    isAgent: false,
    badgeColor: "from-sky-600 to-fuchsia-500",
    icon: GitBranch,
    placeholder: "Ask to change or add a flowchart or pseudocode...",
    buttonLabel: "Customize Flow",
    freeAccessible: false,
  },
];

// If the server times out, Vercel answers with an HTML error page instead of JSON.
// Calling res.json() on that throws "Unexpected token '<'" - show something readable instead.
async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {
      error:
        res.status === 504 || res.status === 408
          ? "The request timed out. Please try again."
          : `Server error (${res.status}). Please try again.`,
    };
  }
}

export default function EditorClient({
  userName = "Developer",
  userEmail = "",
  userImage = null,
  isAdmin = false,
}: {
  userName?: string;
  userEmail?: string;
  userImage?: string | null;
  isAdmin?: boolean;
}) {
  // Navigation & View States
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false);
  }, []);
  // History list in the sidebar: open/close, remembered across refreshes (like a saved setting)
  const HISTORY_OPEN_KEY = "buildcore:historyOpen";
  const [historyOpen, setHistoryOpenState] = useState(true);
  const [historyPrefLoaded, setHistoryPrefLoaded] = useState(false); // avoids a flash of the wrong state on refresh
  useEffect(() => {
    try {
      if (window.localStorage.getItem(HISTORY_OPEN_KEY) === "0") setHistoryOpenState(false);
    } catch {
      /* storage blocked: keep the default (open) */
    }
    setHistoryPrefLoaded(true);
  }, []);
  const setHistoryOpen = (open: boolean) => {
    setHistoryOpenState(open);
    try {
      window.localStorage.setItem(HISTORY_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* storage blocked: still works for this visit */
    }
  };
  const [showPricingModal, setShowPricingModal] = useState(false);
  // Agent list in the sidebar: open/close, remembered across refreshes
  const PIPELINE_OPEN_KEY = "buildcore:pipelineOpen";
  const [pipelineOpen, setPipelineOpenState] = useState(true);
  const [pipelinePrefLoaded, setPipelinePrefLoaded] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(PIPELINE_OPEN_KEY) === "0") setPipelineOpenState(false);
    } catch {
      /* storage blocked: keep the default (open) */
    }
    setPipelinePrefLoaded(true);
  }, []);
  const setPipelineOpen = (open: boolean) => {
    setPipelineOpenState(open);
    try {
      window.localStorage.setItem(PIPELINE_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* storage blocked: still works for this visit */
    }
  };
  // "Describe the Website Idea" box: grows taller as the text gets longer
  const promptRef = useRef<HTMLTextAreaElement>(null);
  // Profile pop-up menu (opens above the profile logo at the bottom of the sidebar)
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const [profileMenuPos, setProfileMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const profileMenuOpen = profileMenuPos !== null;
  const toggleProfileMenu = () => {
    if (profileMenuOpen) return setProfileMenuPos(null);
    const r = profileBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    setProfileMenuPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 264)),
      bottom: window.innerHeight - r.top + 8,
    });
  };
  useEffect(() => {
    if (!profileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProfileMenuPos(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileMenuOpen]);

  // "Make your website online": a centered pop-up with the launch steps (opened by the globe button).
  const [domainOpen, setDomainOpen] = useState(false);
  const [domainView, setDomainView] = useState<"steps" | number>("steps"); // "steps" or the index of the open step
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({}); // step title (or "all-in-one") -> chosen option id
  const [doneSteps, setDoneSteps] = useState<string[]>([]); // titles of the steps the user completed
  const activeStep = typeof domainView === "number" ? DOMAIN_STEPS[domainView] : null;
  const doneCount = DOMAIN_STEPS.filter((st) => doneSteps.includes(st.title)).length;
  const openDomain = () => {
    setProfileMenuPos(null);
    setDomainView("steps"); // always open on the steps
    setDomainOpen(true);
  };
  const setStepDone = (title: string, done: boolean) =>
    setDoneSteps((cur) => (done ? (cur.includes(title) ? cur : [...cur, title]) : cur.filter((t) => t !== title)));

  // Progress is remembered in this browser (per account email), so it is still there after a reload.
  const launchKey = `bc-launch:${userEmail || "me"}`;
  const [launchLoaded, setLaunchLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(launchKey);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === "object") {
        if (saved.selected && typeof saved.selected === "object") setSelectedOptions(saved.selected);
        if (Array.isArray(saved.done)) setDoneSteps(saved.done.filter((x: unknown): x is string => typeof x === "string"));
      }
    } catch {
      /* storage unavailable: start empty */
    }
    setLaunchLoaded(true);
  }, [launchKey]);
  useEffect(() => {
    if (!launchLoaded) return; // do not overwrite saved progress before it has been read
    try {
      localStorage.setItem(launchKey, JSON.stringify({ selected: selectedOptions, done: doneSteps }));
    } catch {
      /* storage unavailable: still works for this visit */
    }
  }, [launchLoaded, launchKey, selectedOptions, doneSteps]);
  useEffect(() => {
    if (!domainOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDomainOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [domainOpen]);

  // One provider card, used by the step choices and by the all-in-one list.
  const optionCard = (o: StepOption, i: number, selected: boolean, onSelect: () => void) => (
    <li
      key={o.id}
      className={`rounded-xl border p-3 transition ${
        selected ? "border-cyan-500/60 bg-cyan-500/10" : "border-slate-800 bg-slate-900/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-lg bg-slate-800 text-cyan-300 text-sm font-bold flex items-center justify-center">
          {o.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-white">
            {i + 1}. {o.name}
          </p>
          <p className="text-[11px] text-slate-400">{o.text}</p>
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-cyan-300 hover:underline break-all"
          >
            {o.host} ↗
          </a>
        </div>
      </div>
      <a
        href={o.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onSelect}
        className={`mt-2.5 w-full flex items-center justify-center py-2 rounded-lg text-[11px] font-bold transition ${
          selected
            ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-200"
            : "bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white hover:brightness-110"
        }`}
      >
        {selected ? "Selected" : "Select this"}
      </a>
    </li>
  );
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  // Focus layout: typing the idea widens the idea panel (the main area shrinks); looking at the
  // Live Preview narrows the idea panel (the main area grows). Desktop only.
  const [writing, setWriting] = useState(false);
  // Full-screen Live Preview: the browser's real full screen where it works, a page-covering overlay otherwise.
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewFull, setPreviewFull] = useState(false);
  const enterPreviewFull = () => {
    setPreviewFull(true);
    try {
      void previewRef.current?.requestFullscreen?.().catch(() => {
        /* not allowed (e.g. iPhone): the overlay below still fills the screen */
      });
    } catch {
      /* same: overlay only */
    }
  };
  const exitPreviewFull = () => {
    setPreviewFull(false);
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPreviewFull(false); // Esc pressed in real full screen
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (!previewFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitPreviewFull();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewFull]);
  const panelMode: "write" | "preview" | "normal" = writing ? "write" : activeTab === "preview" ? "preview" : "normal";
  useEffect(() => {
    if (activeTab === "preview") setWriting(false); // a finished build / tab switch shows the preview
    else if (previewFull) exitPreviewFull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  useEffect(() => {
    // clicks inside the preview iframe do not bubble to the page; the window loses focus to the iframe instead
    const onBlur = () => {
      setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME") setWriting(false);
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);
  const [activeAgentIndex, setActiveAgentIndex] = useState<number>(0);
  const [flowMode, setFlowMode] = useState<"diagram" | "text">("diagram"); // pseudocode & flowchart view

  // Plan & Token States
  const [tier, setTier] = useState<"FREE" | "STANDARD" | "PRO" | "EXCLUSIVE">("FREE");
  const [tokenBalance, setTokenBalance] = useState<number>(3);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>({ name: userName, email: userEmail, image: userImage });
  const [showProfile, setShowProfile] = useState(false);
  useEffect(() => {
    // the server sent a newer profile (after router.refresh): follow it
    setProfile({ name: userName, email: userEmail, image: userImage });
  }, [userName, userEmail, userImage]);
  const [billingReady, setBillingReady] = useState(false); // true once the real plan + tokens came from the server
  const [extraTokensCount, setExtraTokensCount] = useState<number>(5);
  const [billingLoading, setBillingLoading] = useState<string | null>(null);
  const [provider, setProvider] = useState<PaymentProvider>("razorpay");

  // Prompt & Agent Buffers
  const [prompt, setPrompt] = useState("");
  const [showVoice, setShowVoice] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"build" | "edit">("build");
  const [customInstruction, setCustomInstruction] = useState("");
  const [customFiles, setCustomFiles] = useState<Attached[]>([]); // images / files next to Customize (any agent)
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false); // full build only (shows the progress screen)
  const [agentStatus, setAgentStatus] = useState<AgentStatuses>(IDLE_STATUSES);
  const [buildStartedAt, setBuildStartedAt] = useState(() => Date.now());
  const [buildLive, setBuildLive] = useState(true); // false when we reopened the page mid-build
  const watching = React.useRef(false);
  const [copied, setCopied] = useState(false);

  const [buffers, setBuffers] = useState<{
    spec: string;
    frontend: string;
    backend: string;
    database: string;
    qa: string;
    flow: string;
  }>({
    spec: `# Software Requirements Specification\n## Project: Ready to Orchestrate\n\n### Tech Stack\n- Frontend: Next.js 15 + Tailwind CSS\n- Backend: Next.js App Router API\n- Database: PostgreSQL + Prisma ORM\n- Auth: NextAuth.js\n\nDescribe your website idea on the left and click "Build App (${BUILD_COST} Tokens)" to orchestrate your project.`,
    frontend: `export default function GeneratedApp() {\n  return (\n    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">\n      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-center">\n        <span className="px-3 py-1 text-xs font-semibold bg-violet-500/20 text-violet-300 rounded-full">Live Preview Ready</span>\n        <h1 className="text-2xl font-bold mt-4">Build_Core Dynamic App</h1>\n        <p className="text-slate-400 text-sm mt-2">Enter an app idea on the left and click Build to render your live interactive UI here.</p>\n      </div>\n    </div>\n  );\n}`,
    backend: `import { NextResponse } from "next/server";\n\nexport async function GET() {\n  return NextResponse.json({ status: "ok", message: "Agent 3 Backend API Ready" });\n}`,
    database: `model Item {\n  id        String   @id @default(cuid())\n  title     String\n  completed Boolean  @default(false)\n  createdAt DateTime @default(now())\n}`,
    qa: `# Security & Deployment Audit (Agent 5)\n- [x] Environment variables isolated\n- [x] Prisma SQL injection protection verified\n- [x] NextAuth session middleware active\n- [x] Ready for zero-config Vercel production build`,
    flow: `# Pseudocode & Flowcharts\n\nThe flowcharts and pseudocode of your app appear here after the build finishes.`,
  });

  const initialBuffers = React.useRef(buffers);

  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  // The saved generation currently open in the editor; edits are saved back to it.
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  // Agent 5 (the QA review) runs as its own request after the code is saved.
  const qaRunning = React.useRef(false);
  const currentHistoryIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    currentHistoryIdRef.current = currentHistoryId;
  }, [currentHistoryId]);

  const runQaReview = async (id: string) => {
    if (qaRunning.current) return;
    qaRunning.current = true;
    setAgentStatus((p) => ({ ...p, qa: "working" }));
    const unavailable =
      "# QA review unavailable\nThe AI reviewer could not run this time. Your app code is complete. Use Customize QA to ask for the review again.";
    try {
      const res = await fetch("/api/orchestrate/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId: id }),
      });
      const d = await res.json().catch(() => null);
      const text = res.ok && typeof d?.qa === "string" ? d.qa : unavailable;
      // only show it if this build is still the one open on screen
      if (currentHistoryIdRef.current === id || currentHistoryIdRef.current === null) {
        setBuffers((prev) => ({ ...prev, qa: text }));
      }
    } catch {
      if (currentHistoryIdRef.current === id) setBuffers((prev) => ({ ...prev, qa: unavailable }));
    } finally {
      setAgentStatus((p) => ({ ...p, qa: "done" }));
      qaRunning.current = false;
      fetchHistory();
    }
  };

  // Pseudocode & Flowchart also runs as its own request after the code is saved.
  const flowRunning = React.useRef(false);
  const runFlowReview = async (id: string, regenerate = false) => {
    if (flowRunning.current) return;
    flowRunning.current = true;
    setAgentStatus((p) => ({ ...p, flow: "working" }));
    const unavailable =
      "# Pseudocode & Flowcharts unavailable\nThe pseudocode and flowchart could not be created this time. Your app code is complete. Use Customize Flow to ask for it again.";
    try {
      const res = await fetch("/api/orchestrate/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId: id, regenerate }),
      });
      const d = await res.json().catch(() => null);
      if (res.status === 403) return; // free plan: stays locked
      const text = res.ok && typeof d?.flow === "string" ? d.flow : unavailable;
      if (currentHistoryIdRef.current === id || currentHistoryIdRef.current === null) {
        setBuffers((prev) => ({ ...prev, flow: text }));
      }
    } catch {
      if (currentHistoryIdRef.current === id) setBuffers((prev) => ({ ...prev, flow: unavailable }));
    } finally {
      setAgentStatus((p) => ({ ...p, flow: "done" }));
      flowRunning.current = false;
      fetchHistory();
    }
  };

  const openHistoryItem = (item: HistoryItem) => {
    setPrompt(item.prompt);
    setCurrentHistoryId(item.id);
    setBuffers((prev) => ({
      ...prev,
      spec: item.spec,
      frontend: item.frontend,
      backend: item.backend,
      database: item.database,
      qa:
        item.qa ||
        "# Agent 5 QA Report\n\nNo QA report was saved for this generation.",
      flow: item.flow || "# Pseudocode & Flowcharts\n\nThe flowcharts and pseudocode for this build are being drawn. They appear here in a moment.",
    }));
    // the review of this build never finished (tab closed): run it now
    if (isQaPending(item.qa) && (!item.status || item.status === "DONE")) void runQaReview(item.id);
    // builds made before this feature existed (or whose tab was closed): create it now, once
    if (!item.flow && (!item.status || item.status === "DONE") && tier !== "FREE") void runFlowReview(item.id);
  };

  // NEW CHAT: clear the idea, the generated code and the open history item, back to a blank start.
  const handleNewChat = () => {
    if (isGenerating || isBuilding) return; // never throw away a build that is running
    setPrompt("");
    setCustomInstruction("");
    setBuffers(initialBuffers.current);
    setCurrentHistoryId(null);
    setAgentStatus(IDLE_STATUSES);
    setActiveAgentIndex(0);
    setActiveTab("editor");
    setBuildQuestions(null);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  };

  // ENHANCE PROMPT: the AI rewrites the idea into a fuller request (free, no token).
  const [isEnhancing, setIsEnhancing] = useState(false);
  const handleEnhancePrompt = async () => {
    if (!prompt.trim() || isEnhancing || isGenerating) return;
    setIsEnhancing(true);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.prompt !== "string") {
        throw new Error(data?.error || "Could not enhance the prompt. Please try again.");
      }
      setPrompt(data.prompt.slice(0, 1000));
    } catch (err: any) {
      alert(err.message || "Could not enhance the prompt.");
    } finally {
      setIsEnhancing(false);
    }
  };

  const maxTokensForPlan = TIER_TOKENS[tier];

  useEffect(() => {
    // Back from Stripe Checkout: the webhook may take a few seconds to credit the account.
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      window.history.replaceState(null, "", window.location.pathname);
      fetch("/api/billing")
        .then((r) => (r.ok ? r.json() : null))
        .then((before) => {
          if (before) pollBillingUntilChanged(before);
        })
        .catch(() => {});
    } else if (params.get("checkout")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    fetchBillingStatus();
    fetchHistory(false, true); // start on a NEW chat; only follow a build that is still running
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBillingStatus = async () => {
    try {
      const res = await fetch("/api/billing", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.tier) setTier(data.tier);
        if (typeof data.tokenBalance === "number") {
          setTokenBalance(data.tokenBalance);
        }
        setBillingReady(true);
      }
    } catch (e) {}
  };

  const fetchHistory = async (restoreLatest = false, resumeRunning = false) => {
    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.history)) {
          setHistoryList(data.history);
          const finished = data.history.find((h: HistoryItem) => !h.status || h.status === "DONE");
          if (restoreLatest && finished) openHistoryItem(finished);
          // A build is still running on the server (tab was closed or refreshed): follow it.
          const running = data.history.find((h: HistoryItem) => h.status === "BUILDING");
          if ((restoreLatest || resumeRunning) && running) watchRunningBuild(new Date(running.createdAt).getTime());
        }
      }
    } catch (e) {}
  };

  // Follows a build that is running on the server without a live connection to it.
  const watchRunningBuild = async (startedAt: number) => {
    if (watching.current) return;
    watching.current = true;
    setBuildStartedAt(startedAt);
    setBuildLive(false);
    setIsBuilding(true);
    setIsGenerating(true);
    try {
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const res = await fetch("/api/history?light=1", { cache: "no-store" }).catch(() => null);
        if (!res || !res.ok) continue;
        const data = await res.json();
        const latest = Array.isArray(data.history) ? data.history[0] : null;
        if (!latest || latest.status === "BUILDING") continue;
        if (latest.status === "FAILED") alert(latest.error || "The build failed. Your token was returned.");
        await fetchHistory(latest.status === "DONE");
        await fetchBillingStatus();
        return;
      }
    } finally {
      watching.current = false;
      setIsBuilding(false);
      setIsGenerating(false);
    }
  };

  const currentAgent = AGENTS[activeAgentIndex];
  const isCurrentAgentLocked = tier === "FREE" && !currentAgent.freeAccessible;

  // Waits for Stripe's webhook to credit the plan/tokens (usually 1-5 seconds).
  const pollBillingUntilChanged = async (before: { tier: string; tokenBalance: number }) => {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch("/api/billing");
        if (!res.ok) continue;
        const d = await res.json();
        if (d.tier !== before.tier || d.tokenBalance !== before.tokenBalance) {
          setTier(d.tier);
          setTokenBalance(d.tokenBalance);
          return;
        }
      } catch {}
    }
  };

  // Upgrade Plan Handler (prices come from lib/plans.ts, via Stripe; Exclusive = contact us)
  const handleSelectPlan = async (selectedPlan: string) => {
    if (selectedPlan === "FREE") {
      setShowPricingModal(false);
      return;
    }
    if (selectedPlan === "EXCLUSIVE") {
      contactForExclusive();
      return;
    }
    setBillingLoading(selectedPlan);
    const before = { tier, tokenBalance };
    const result = await startCheckout({ action: "PLAN", plan: selectedPlan }, provider);
    if (result.kind === "demo") {
      setTier(result.tier as typeof tier);
      setTokenBalance(result.tokenBalance);
      setShowPricingModal(false);
    } else if (result.kind === "switched") {
      setShowPricingModal(false);
      await pollBillingUntilChanged(before);
    } else if (result.kind === "error") {
      alert(result.error);
    }
    // "redirect": the browser is already on its way to Stripe.
    setBillingLoading(null);
  };

  // Buy Extra Tokens (price per token from lib/plans.ts, paid through Stripe Checkout)
  const handleBuyExtraTokens = async (countToBuy: number) => {
    setBillingLoading("TOPUP");
    const result = await startCheckout({ action: "TOKENS", tokens: countToBuy }, provider);
    if (result.kind === "demo") {
      setTokenBalance(result.tokenBalance);
      setShowPricingModal(false);
    } else if (result.kind === "error") {
      alert(result.error);
    }
    setBillingLoading(null);
  };

  // Paid users: Stripe's customer portal (cancel, invoices, card).
  const handleManageSubscription = async () => {
    setBillingLoading("PORTAL");
    const result = await startCheckout({ action: "PORTAL" });
    if (result.kind === "error") alert(result.error);
    setBillingLoading(null);
  };

  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "auto"; // shrink first so deleting text makes the box smaller again
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt, panelMode]);

  // Full App Build Handler (Enforces Token Deduction & Free Plan Visibility)
  // Step 1: ask 3 questions about the idea (free), then build with the answers.
  const [buildQuestions, setBuildQuestions] = useState<BuildQuestion[] | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false); // advanced build: open website questions, ADVANCED_BUILD_COST tokens

  const handleBuildApp = async (advanced = false) => {
    if (!prompt.trim() || isAsking || !billingReady) return;

    if (tokenBalance < (advanced ? ADVANCED_BUILD_COST : BUILD_COST)) {
      if (advanced && tokenBalance > 0) {
        alert(`An advanced build needs ${ADVANCED_BUILD_COST} tokens and you have ${tokenBalance}. Buy more tokens, or use the normal build (${BUILD_COST} tokens).`);
      }
      setShowPricingModal(true);
      return;
    }

    setIsAsking(true);
    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: advanced ? "advanced" : "quick" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.questions) && data.questions.length > 0) {
        setAdvancedMode(advanced);
        setBuildQuestions(data.questions);
        return;
      }
    } catch {
      // fall through
    } finally {
      setIsAsking(false);
    }
    if (advanced) {
      // Never charge 3 tokens without the advanced questions: ask the person to try again.
      alert("Could not prepare the advanced questions right now. Please try again in a moment (nothing was charged).");
      return;
    }
    runBuild(prompt); // quick mode: build straight from the idea
  };

  // Step 2: the person answered (or skipped): build with the idea plus the answers.
  const handleAnswersSubmit = (answers: { question: string; answer: string }[]) => {
    setBuildQuestions(null);
    if (advancedMode) {
      const detail = answers.map((a, i) => `${i + 1}. ${a.question}\n   Answer: ${a.answer}`).join("\n");
      runBuild(
        detail
          ? `${prompt.trim()}\n\nADVANCED REQUIREMENTS (the person answered these in detail; build every page, role and rule they describe, including the admin side and the user side):\n${detail}`
          : prompt,
        true
      );
      return;
    }
    const extra = answers.map((a) => `${a.question} ${a.answer}`).join(" | ");
    runBuild(extra ? `${prompt.trim()}\n\nUser needs: ${extra}` : prompt);
  };

  const runBuild = async (finalPrompt: string, advanced = false) => {
    if (!finalPrompt.trim()) return;

    setIsGenerating(true);
    setIsBuilding(true);
    setAgentStatus(IDLE_STATUSES);
    setBuildStartedAt(Date.now());
    setBuildLive(true);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt, advanced }),
      });

      let data: any;
      if (res.ok && res.body && (res.headers.get("content-type") || "").includes("ndjson")) {
        // Live progress: one JSON line per event, the last line is the finished build.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let failure: string | null = null;
        data = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let ev: any;
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.type === "agent") {
              setAgentStatus((prev) => ({
                ...prev,
                [ev.agent]: ev.status === "start" ? "working" : ev.status === "retry" ? "retry" : "done",
              }));
            } else if (ev.type === "done") data = ev;
            else if (ev.type === "error") failure = ev.error;
          }
        }
        if (failure) throw new Error(failure);
        if (!data) {
          // The connection dropped but the server keeps building: follow it from the database.
          watchRunningBuild(Date.now());
          return;
        }
      } else {
        data = await readJson(res);
        if (!res.ok) {
          if (data.code === "OUT_OF_TOKENS" || data.code === "PLAN_LOCKED") {
            setShowPricingModal(true);
            return;
          }
          throw new Error(data.error || "Failed to generate app");
        }
      }

      setBuffers({
        spec: data.spec || buffers.spec,
        frontend: data.frontend || buffers.frontend,
        backend: data.backend || buffers.backend,
        database: data.database || buffers.database,
        qa:
          data.qa ||
          `# Agent 5 QA Report\n- [x] Verified Spec & API routes for: "${prompt.slice(0, 40)}..."\n- [x] Production build checks passed.`,
        flow: data.flowPending
          ? "# Pseudocode & Flowcharts\n\nThe flowcharts and pseudocode are being drawn. They appear here in a moment."
          : buffers.flow,
      });

      if (typeof data.historyId === "string") {
        setCurrentHistoryId(data.historyId);
      }

      if (typeof data.tokenBalance === "number") {
        setTokenBalance(data.tokenBalance);
      } else {
        setTokenBalance((prev) => Math.max(0, prev - (advanced ? ADVANCED_BUILD_COST : BUILD_COST)));
      }

      if (data.tier) {
        setTier(data.tier);
      }

      // Free plan: show the running app; the code stays locked
      if ((data.tier || tier) === "FREE") {
        setActiveAgentIndex(0);
        setActiveTab("preview");
      }

      // Agent 5 runs as its own request now (fresh time budget); the code is already saved.
      // Agents 5 and 6 run side by side.
      if (typeof data.historyId === "string") {
        await Promise.all([
          data.qaPending ? runQaReview(data.historyId) : Promise.resolve(),
          data.flowPending ? runFlowReview(data.historyId) : Promise.resolve(),
        ]);
      }

      fetchHistory();
    } catch (err: any) {
      alert(err.message || "Error during generation");
      fetchBillingStatus(); // the token of a failed build was returned
    } finally {
      if (!watching.current) {
        setIsGenerating(false);
        setIsBuilding(false);
      }
    }
  };

  // Single-Agent Customize Handler (Bottom Bar)
  const handleCustomizeAgent = async () => {
    if (isCurrentAgentLocked) {
      setShowPricingModal(true);
      return;
    }
    if (!customInstruction.trim()) return;

    // Customizing costs tokens (same as the server enforces).
    if (tokenBalance < CUSTOMIZE_COST) {
      setShowPricingModal(true);
      return;
    }

    setIsGenerating(true);
    try {
      const key = currentAgent.key as keyof typeof buffers;
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || "Update current module",
          agent: currentAgent.key,
          currentCode: buffers[key],
          instruction: customInstruction,
          attachments: toPayload(customFiles),
          historyId: currentHistoryId,
        }),
      });

      const data = await readJson(res);
      if (!res.ok) {
        if (data.code === "PLAN_LOCKED" || data.code === "OUT_OF_TOKENS") {
          setShowPricingModal(true);
          return;
        }
        throw new Error(data.error || "Failed to customize agent");
      }

      const updatedValue =
        data.updatedCode || data[key] || data.spec || buffers[key];
      setBuffers((prev) => ({
        ...prev,
        [key]: updatedValue,
      }));
      if (typeof data.tokenBalance === "number") {
        setTokenBalance(data.tokenBalance);
      }
      setCustomInstruction("");
      setCustomFiles([]);
    } catch (e: any) {
      alert(e.message || "Failed to customize");
    } finally {
      setIsGenerating(false);
    }
  };

  // "Talk to edit": open the voice panel (editing is a paid feature, like Customize).
  const openVoiceEdit = () => {
    if (tier === "FREE") {
      setShowPricingModal(true);
      return;
    }
    setVoiceMode("edit");
    setShowVoice(true);
  };

  // Short summary of the current app, so the voice AI knows what it is changing.
  const voiceContext = `Requirements:\n${buffers.spec.slice(0, 1800)}\n\nCurrent page code (start):\n${buffers.frontend.slice(0, 1200)}`;

  // Called by the voice panel when the person says "apply". Same call and cost as Customize.
  const applyVoiceEdit = async (agentKey: string, instruction: string): Promise<ApplyResult> => {
    const agent = AGENTS.find((a) => a.key === agentKey) ?? AGENTS[1];
    const key = agent.key as keyof typeof buffers;
    if (tier === "FREE") {
      setShowPricingModal(true);
      return { ok: false, message: "Editing needs a paid plan. Please upgrade first." };
    }
    if (tokenBalance < CUSTOMIZE_COST) {
      setShowPricingModal(true);
      return { ok: false, message: `Applying a change needs ${CUSTOMIZE_COST} token and you have none left. Please buy a token, then say apply again.` };
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || "Update current module",
          agent: key,
          currentCode: buffers[key],
          instruction,
          historyId: currentHistoryId,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        if (data.code === "PLAN_LOCKED" || data.code === "OUT_OF_TOKENS") setShowPricingModal(true);
        return { ok: false, message: data.error || "The change failed. Please try again." };
      }
      const updated = data.updatedCode || data[key] || data.spec || buffers[key];
      setBuffers((prev) => ({ ...prev, [key]: updated }));
      if (typeof data.tokenBalance === "number") setTokenBalance(data.tokenBalance);
      setActiveAgentIndex(AGENTS.findIndex((a) => a.key === key));
      return { ok: true, message: `Done. I updated the ${agent.role || agent.name}. Check the result, or tell me the next change.` };
    } catch (e: any) {
      return { ok: false, message: e?.message || "The change failed. Please try again." };
    } finally {
      setIsGenerating(false);
    }
  };

  // Export ZIP (Locked on Free Plan)
  const handleExportZip = async () => {
    if (tier === "FREE") {
      setShowPricingModal(true);
      return;
    }
    const zip = new JSZip();
    const appName =
      (buffers.spec.match(/^#\s+(?:Software Requirements Specification:?\s*)?(.+)$/m)?.[1] || "").trim() ||
      "My App";

    // 1) fixed project files, so the ZIP can be run with npm install && npm run dev
    for (const f of scaffoldFiles(appName)) zip.file(f.path, f.content);
    // 2) documents
    zip.file("SRS.md", buffers.spec);
    zip.file("QA_REPORT.md", buffers.qa);
    zip.file("PSEUDOCODE_AND_FLOWCHART.md", buffers.flow); // mermaid blocks render on GitHub and in most Markdown viewers
    // 3) generated code (written last, so it can override a scaffold file if it must)
    for (const f of parseFiles(buffers.frontend, "app/page.tsx")) {
      const path = cleanPath(f.path);
      if (path) zip.file(path, f.content);
    }
    for (const f of parseFiles(buffers.backend, "app/api/route.ts")) {
      const path = cleanPath(f.path);
      if (path) zip.file(path, f.content);
    }
    zip.file("prisma/schema.prisma", buffers.database);
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "build-core-app.zip");
  };

  const handleCopyCode = () => {
    if (isCurrentAgentLocked) {
      setShowPricingModal(true);
      return;
    }
    const key = currentAgent.key as keyof typeof buffers;
    navigator.clipboard.writeText(buffers[key]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Re-compiled only when the generated frontend changes (not on every keystroke elsewhere),
  // so typing in the prompt box never reloads the running preview.
  const previewHtml = useMemo(
    () => buildPreviewHtml(buffers.frontend),
    [buffers.frontend]
  );

  const currentCodeValue = buffers[currentAgent.key as keyof typeof buffers];
  const usagePercent = Math.min(
    100,
    Math.round((tokenBalance / maxTokensForPlan) * 100)
  );

  return (
    <div className="h-[100dvh] overflow-y-auto lg:overflow-hidden bg-[#0B0F19] text-slate-100 flex flex-col lg:flex-row font-sans select-none relative">
      {/* 1. LEFTMOST COLLAPSIBLE NAVIGATION & PLAN PROGRESS SIDEBAR */}
      <aside
        className={`${
          sidebarOpen ? "lg:w-64 max-h-[75vh]" : "lg:w-16 max-h-16"
        } w-full lg:max-h-none overflow-hidden transition-all duration-300 bg-[#070A12] border-b lg:border-b-0 lg:border-r border-slate-800/80 flex flex-col justify-between shrink-0 z-20`}
      >
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
                title="Toggle Menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              {sidebarOpen && (
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-violet-200 to-cyan-300 bg-clip-text text-transparent">
                    Build_Core
                  </span>
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                    {tier}
                  </span>
                </div>
              )}
            </div>
          </div>

          <nav className="p-3 space-y-1.5">
            <button
              onClick={handleNewChat}
              disabled={isGenerating || isBuilding}
              title="Start a new chat"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-bold text-white bg-gradient-to-r from-violet-600/80 to-cyan-500/80 hover:brightness-110 disabled:opacity-50 transition"
            >
              <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" />
              {sidebarOpen && <span>New Chat</span>}
            </button>

            {sidebarOpen ? (
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                aria-expanded={historyOpen}
                title={historyOpen ? "Hide history" : "Show history"}
                className="group w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
              >
                <span className="flex items-center gap-3">
                  <History className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="flex items-center gap-1">
                    History
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${historyOpen ? "" : "-rotate-90"}`}
                    />
                  </span>
                </span>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-slate-800 text-cyan-300">
                  {historyList.length}
                </span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setSidebarOpen(true);
                  setHistoryOpen(true);
                }}
                title="History"
                aria-label="Open history"
                className="w-full flex items-center justify-center px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
              >
                <History className="w-4 h-4 text-cyan-400 shrink-0" />
              </button>
            )}

            {sidebarOpen && historyPrefLoaded && historyOpen && (
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                {historyList.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-4 px-2">
                    No builds yet. Click &quot;Build App&quot; to create your first project!
                  </p>
                ) : (
                  historyList.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (item.status === "BUILDING") return;
                        if (item.status === "FAILED") {
                          alert(item.error || "This build failed. Your token was returned.");
                          return;
                        }
                        openHistoryItem(item);
                        if (window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false);
                      }}
                      className={`p-2.5 rounded-lg border cursor-pointer transition ${
                        currentHistoryId === item.id
                          ? "bg-violet-600/20 border-violet-500/50"
                          : "bg-slate-900/80 hover:bg-slate-800 border-slate-800 hover:border-violet-500/50"
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-slate-200 line-clamp-2">{item.prompt}</p>
                      <span className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                        {new Date(item.createdAt).toLocaleDateString()}
                        {item.status === "BUILDING" && (
                          <span className="px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-bold animate-pulse">Building…</span>
                        )}
                        {item.status === "FAILED" && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">Failed · token returned</span>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </nav>

          {/* MULTI-AGENT PIPELINE (hides/shrinks with the sidebar) */}
          <div className="px-3 pb-3 pt-1 space-y-1.5">
            {sidebarOpen ? (
              <button
                onClick={() => setPipelineOpen(!pipelineOpen)}
                aria-expanded={pipelineOpen}
                title={pipelineOpen ? "Hide agents" : "Show agents"}
                className="group w-full flex items-center justify-between px-1 pb-1"
              >
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-white transition">
                  Multi-Agent Pipeline
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${pipelineOpen ? "" : "-rotate-90"}`}
                  />
                </span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {tier === "FREE" ? "1/5" : "5/5"}
                </span>
              </button>
            ) : (
              <div className="border-t border-slate-800/80 mb-2" />
            )}

            {pipelinePrefLoaded && (pipelineOpen || !sidebarOpen) && AGENTS.map((agent, index) => {
              const Icon = agent.icon;
              const isSelected = activeAgentIndex === index;
              const isLocked = tier === "FREE" && !agent.freeAccessible;

              return (
                <button
                  key={agent.id}
                  onClick={() => setActiveAgentIndex(index)}
                  title={`${agent.name}${agent.role ? ` • ${agent.role}` : ""}${isLocked ? " (Locked)" : ""}`}
                  className={`w-full flex items-center ${
                    sidebarOpen ? "justify-between px-2.5 py-2" : "justify-center p-1.5"
                  } rounded-xl border text-left transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-violet-600/25 via-indigo-600/20 to-transparent border-violet-500 text-white shadow-md shadow-violet-950/50"
                      : "bg-[#131B2E]/70 hover:bg-[#131B2E] border-slate-800/80 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`relative w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br ${agent.badgeColor} flex items-center justify-center text-white shadow`}
                    >
                      <Icon className="w-4 h-4" />
                      {!sidebarOpen && isLocked && (
                        <Lock className="absolute -top-1 -right-1 w-3 h-3 text-amber-400 bg-[#070A12] rounded-full p-[1px]" />
                      )}
                    </div>
                    {sidebarOpen && (
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">
                          {agent.name}
                          {agent.role && (
                            <span className="text-[10px] font-normal text-slate-400">
                              {" "}• {agent.role}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {isLocked ? "Locked on Free Plan" : "Editable Buffer"}
                        </span>
                      </div>
                    )}
                  </div>

                  {sidebarOpen &&
                    (isLocked ? (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-semibold flex items-center gap-1">
                        <Lock className="w-3 h-3" /> {STANDARD_PRICE_LABEL}
                      </span>
                    ) : (
                      <CheckCircle2
                        className={`shrink-0 w-4 h-4 ${
                          isSelected ? "text-cyan-400" : "text-emerald-500/60"
                        }`}
                      />
                    ))}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom: profile logo + nickname, with a Domain & Hosting button beside it */}
        <div className="px-3 py-2.5 shrink-0">
          <div
            className={`flex ${
              sidebarOpen ? "items-center justify-between gap-2" : "flex-col items-center gap-2"
            }`}
          >
            <button
              ref={profileBtnRef}
              onClick={toggleProfileMenu}
              title="Account"
              aria-label="Account menu"
              aria-expanded={profileMenuOpen}
              className="flex items-center gap-2 min-w-0 rounded-lg px-1.5 py-1 hover:bg-slate-800/60 transition"
            >
              <Avatar name={profile.name} image={profile.image} size={26} />
              {sidebarOpen && (
                <span className="flex items-center gap-1 min-w-0 text-[13px]">
                  <span className="font-semibold text-slate-200 truncate">{profile.name}</span>
                  <span className="text-slate-500 shrink-0">
                    · {tier === "FREE" ? "Free" : tier.charAt(0) + tier.slice(1).toLowerCase()}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </span>
              )}
            </button>

            <button
              onClick={openDomain}
              title="Make your website online"
              aria-label="Make your website online"
              aria-haspopup="dialog"
              className="relative shrink-0 w-7 h-7 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 transition"
            >
              <Globe className="w-3.5 h-3.5" />
              {doneCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[1.6rem] h-4 px-1 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-bold flex items-center justify-center">
                  {doneCount}/{DOMAIN_STEPS.length}
                </span>
              )}
            </button>
          </div>

          {profileMenuPos && (
            <>
              <button
                aria-label="Close menu"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setProfileMenuPos(null)}
              />
              <div
                role="menu"
                style={{ left: profileMenuPos.left, bottom: profileMenuPos.bottom }}
                className="fixed z-50 w-64 rounded-2xl bg-[#0D1322] border border-slate-800 p-2 shadow-2xl"
              >
                <div className="px-3 pt-2 pb-2.5">
                  <p className="text-xs text-slate-400 truncate">{profile.email || profile.name}</p>
                  <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    {tier === "FREE" ? "Free Plan" : `${tier} Plan`} · {tokenBalance} / {maxTokensForPlan} tokens left
                  </p>
                </div>

                <button
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuPos(null);
                    setShowProfile(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/70 transition"
                >
                  <Settings className="w-4 h-4 text-slate-400" /> Profile settings
                </button>
                <Link
                  role="menuitem"
                  href="/terms"
                  target="_blank"
                  onClick={() => setProfileMenuPos(null)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/70 transition"
                >
                  <FileText className="w-4 h-4 text-slate-400" /> Terms &amp; Conditions
                </Link>
                <Link
                  role="menuitem"
                  href="/request"
                  onClick={() => setProfileMenuPos(null)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/70 transition"
                >
                  <FileText className="w-4 h-4 text-slate-400" /> Request access or tokens
                </Link>
                {isAdmin && (
                  <Link
                    role="menuitem"
                    href="/admin"
                    onClick={() => setProfileMenuPos(null)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-violet-200 hover:bg-slate-800/70 transition"
                  >
                    <ShieldCheck className="w-4 h-4 text-violet-400" /> Admin dashboard
                  </Link>
                )}

                <div className="my-1.5 border-t border-slate-800" />

                <button
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuPos(null);
                    setShowPricingModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/70 transition"
                >
                  <Crown className="w-4 h-4 text-amber-400" />
                  {tier === "FREE" ? "Upgrade plan" : "Buy extra tokens"}
                </button>

                <div className="my-1.5 border-t border-slate-800" />

                <button
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800/70 transition"
                >
                  <LogOut className="w-4 h-4 text-slate-400" /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* 2. SECOND COLUMN: PROMPT BOX + BUILD BUTTON + AGENT 1-5 STACK */}
      <section
        className={`w-full ${
          panelMode === "write" ? "lg:w-[30rem]" : panelMode === "preview" ? "lg:w-64" : "lg:w-80"
        } lg:transition-[width] lg:duration-300 bg-[#0E1424] border-b lg:border-b-0 lg:border-r border-slate-800/80 flex flex-col justify-between p-4 shrink-0 lg:overflow-y-auto`}
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              Build_Core Studio
            </h2>
            <p className="text-[11px] text-slate-400">
              5-Agent Autonomous Architecture
            </p>
          </div>

          <div className="bg-[#131B2E] border border-slate-800 rounded-2xl p-3.5 shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Describe the Website Idea
              </label>
              <span className="text-[10px] text-slate-500">
                {prompt.length}/1000
              </span>
            </div>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={() => setWriting(true)}
              rows={panelMode === "preview" ? 2 : 4}
              maxLength={1000}
              placeholder="e.g. A task manager with PostgreSQL database, user auth, and analytics..."
              className={`select-text w-full bg-[#0B0F19] border border-slate-800/90 rounded-xl p-3 text-base sm:text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 resize-none overflow-y-auto ${
                panelMode === "preview" ? "lg:max-h-24" : "max-h-[60vh]"
              } ${panelMode === "write" ? "lg:min-h-[12rem]" : ""}`}
            />

            <div className={`mt-3 flex items-stretch gap-2 ${panelMode === "preview" ? "lg:flex-wrap" : ""}`}>
              <button
                onClick={() => handleBuildApp(false)}
                disabled={isGenerating || isAsking || !billingReady}
                className={`${panelMode === "preview" ? "lg:basis-full" : ""} flex-1 min-w-0 h-10 whitespace-nowrap rounded-lg font-bold text-[11px] uppercase tracking-wide text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2 disabled:opacity-50`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                {!billingReady
                  ? "Loading..."
                  : isAsking
                  ? "Preparing questions..."
                  : isGenerating
                  ? "Orchestrating Agents..."
                  : tokenBalance >= BUILD_COST
                  ? `Build App (${BUILD_COST} Tokens)`
                  : `Top Up Tokens (${TOKEN_PRICE_LABEL})`}
              </button>

              {/* Enhance prompt: the AI rewrites the idea into a fuller one (free) */}
              <button
                type="button"
                onClick={handleEnhancePrompt}
                disabled={!prompt.trim() || isEnhancing || isGenerating || isAsking}
                title="Enhance prompt with AI (free)"
                aria-label="Enhance prompt with AI"
                className="shrink-0 w-9 h-10 rounded-lg bg-[#1F1F1F] hover:bg-[#2B2B2B] border border-white/10 text-amber-300 transition active:scale-95 flex items-center justify-center disabled:opacity-40"
              >
                <Wand2 className={`w-4 h-4 ${isEnhancing ? "animate-pulse" : ""}`} strokeWidth={1.75} />
              </button>

              {/* Talk to build: icon-only mic button */}
              <button
                type="button"
                onClick={() => {
                  setVoiceMode("build");
                  setShowVoice(true);
                }}
                title={`Talk to build · ${VOICE_PRICE_LABEL} (${VOICE_TOKEN_LABEL})`}
                aria-label={`Talk to build · ${VOICE_PRICE_LABEL} (${VOICE_TOKEN_LABEL})`}
                className="shrink-0 w-9 h-10 rounded-lg bg-[#1F1F1F] hover:bg-[#2B2B2B] border border-white/10 text-white transition active:scale-95 flex items-center justify-center"
              >
                <Mic className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            {/* Advanced build: its own row (open website questions: pages, admin/user roles, data, rules) */}
            <button
              onClick={() => handleBuildApp(true)}
              disabled={isGenerating || isAsking || !billingReady || !prompt.trim()}
              title={`Answer 7 detailed questions about pages, admin and user roles, data and rules · ${ADVANCED_BUILD_COST} tokens`}
              className="mt-2 w-full h-9 rounded-lg text-[11px] font-bold uppercase tracking-wide text-violet-200 bg-gradient-to-r from-violet-500/15 to-cyan-500/15 border border-violet-500/40 hover:border-violet-400 hover:from-violet-500/25 hover:to-cyan-500/25 active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-violet-300" />
              <span className="truncate">Advanced Build</span>
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-violet-500/25 text-[10px] text-violet-100">{ADVANCED_BUILD_COST} Tokens</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. RIGHT MAIN WORKSPACE: TOP TABS + SINGLE AGENT STAGE / UNLOCK + BOTTOM BAR */}
      <main onPointerDown={() => setWriting(false)} className="w-full min-w-0 min-h-[100dvh] lg:min-h-0 lg:flex-1 flex flex-col justify-between bg-[#0B0F19] lg:overflow-hidden">
        <header className="min-h-16 px-3 sm:px-6 py-2 gap-2 flex-wrap border-b border-slate-800/80 flex items-center justify-between bg-[#0E1424]/60 backdrop-blur">
          <div className="flex items-center gap-2 bg-[#090D16] p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setWriting(false);
                setActiveTab("editor");
              }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "editor"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Code Editor
            </button>

            <button
              onClick={() => {
                setWriting(false);
                setActiveTab("preview");
              }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "preview"
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Live Preview
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportZip}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export ZIP
            </button>
          </div>
        </header>

        {/* CENTER STAGE: Active Agent Header + Code/Preview or UNLOCK FOR (Standard price) Overlay */}
        <div className="flex-1 min-h-[70vh] lg:min-h-0 p-3 sm:p-6 overflow-hidden flex flex-col">
          <div className="flex-1 rounded-2xl bg-[#111827] border border-slate-800/90 shadow-2xl flex flex-col overflow-hidden relative">
            <div className="px-3 sm:px-5 py-3.5 gap-2 flex-wrap bg-[#0D1322] border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider text-white bg-gradient-to-r ${currentAgent.badgeColor} shadow`}
                >
                  {currentAgent.name}
                </span>
                <h3 className="text-sm font-bold text-white">
                  {currentAgent.role} {isCurrentAgentLocked ? "(Locked on Free Plan)" : "(Editable)"}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {activeTab === "preview" ? (
                  <button
                    onClick={enterPreviewFull}
                    title="Show the live preview full screen"
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    Full Screen
                  </button>
                ) : (
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Buffer
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {isBuilding && (
              <BuildProgress free={tier === "FREE"} statuses={agentStatus} startedAt={buildStartedAt} live={buildLive} />
            )}

            {activeTab === "editor" ? (
              <div className="flex-1 relative flex flex-col min-h-0">
                {currentAgent.key === "flow" && !isCurrentAgentLocked && (
                  <div className="flex items-center gap-1 px-4 py-2 bg-[#0D1322] border-b border-slate-800 shrink-0">
                    {([["diagram", "Flowchart view"], ["text", "Edit text"]] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => setFlowMode(mode)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition ${flowMode === mode ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"}`}
                      >
                        {label}
                      </button>
                    ))}
                    {currentHistoryId && (
                      <button
                        onClick={() => void runFlowReview(currentHistoryId, true)}
                        disabled={agentStatus.flow === "working"}
                        className="ml-auto px-3 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition"
                      >
                        {agentStatus.flow === "working" ? "Redrawing…" : "Redraw"}
                      </button>
                    )}
                  </div>
                )}
                {currentAgent.key === "flow" && !isCurrentAgentLocked && flowMode === "diagram" ? (
                  <FlowView source={buffers.flow} />
                ) : (
                <textarea
                  value={isCurrentAgentLocked ? LOCKED_TEXT : currentCodeValue}
                  onChange={(e) => {
                    if (isCurrentAgentLocked) return;
                    const key = currentAgent.key as keyof typeof buffers;
                    setBuffers((prev) => ({ ...prev, [key]: e.target.value }));
                  }}
                  readOnly={isCurrentAgentLocked}
                  className={`select-text w-full flex-1 bg-[#090D16] p-5 font-mono text-xs leading-relaxed text-cyan-100 focus:outline-none resize-none ${
                    isCurrentAgentLocked ? "blur-md select-none opacity-30" : ""
                  }`}
                />
                )}

                {/* UNLOCK FOR (STANDARD PRICE) OVERLAY ON AGENTS 2, 3, 4, 5 FOR FREE PLAN */}
                {isCurrentAgentLocked && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-10">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-500/20 mb-4">
                      <Lock className="w-7 h-7" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold uppercase tracking-wider mb-2">
                      Free Plan — Live Preview Only
                    </span>
                    <h4 className="text-xl font-extrabold text-white mb-2">
                      Unlock the code: {currentAgent.name}{currentAgent.role ? ` (${currentAgent.role})` : ""}
                    </h4>
                    <p className="text-xs text-slate-300 max-w-md mb-6 leading-relaxed">
                      Your Free Plan includes <strong>{FREE_TRIAL_BUILDS} one-time trial build{FREE_TRIAL_BUILDS === 1 ? "" : "s"}</strong> where you can run your app in the <strong>Live Preview</strong>. Viewing, copying, editing and exporting the code needs a paid plan. Upgrade to <strong>Standard ({STANDARD_PRICE_LABEL} / {TIER_TOKENS.STANDARD} Tokens)</strong>, <strong>Pro ({PRO_PRICE_LABEL} / {TIER_TOKENS.PRO} Tokens)</strong>, or <strong>Exclusive</strong> to unlock all 5 agents, the pseudocode & flowchart and the full code!
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        onClick={() => handleSelectPlan("STANDARD")}
                        disabled={billingLoading === "STANDARD"}
                        className="px-7 py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:brightness-110 shadow-xl shadow-amber-500/30 transition transform hover:-translate-y-0.5"
                      >
                        {billingLoading === "STANDARD"
                          ? "Unlocking..."
                          : `UNLOCK FOR (${STANDARD_PRICE_LABEL}) — ${TIER_TOKENS.STANDARD} TOKENS →`}
                      </button>
                      <button
                        onClick={() => setShowPricingModal(true)}
                        className="px-5 py-3.5 rounded-xl font-bold text-xs text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 transition"
                      >
                        View All Plans ({PRO_PRICE_LABEL} Pro / Custom)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                ref={previewRef}
                className={`bg-[#090D16] relative ${previewFull ? "fixed inset-0 z-[100]" : "flex-1"}`}
              >
                <iframe
                  title="Live App Preview"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts allow-modals"
                  className="w-full h-full border-0"
                />
                {previewFull && (
                  <button
                    onClick={exitPreviewFull}
                    title="Exit full screen (Esc)"
                    className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 backdrop-blur border border-slate-700 text-slate-100 text-xs font-semibold shadow-lg transition"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    Exit Full Screen
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM NAVIGATION & CUSTOMIZE BAR: [Back] [Next] [Customize Spec] */}
        <footer className="min-h-20 px-3 sm:px-6 py-3 flex-wrap border-t border-slate-800/80 bg-[#0E1424] flex items-center justify-between gap-3 sm:gap-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() =>
                setActiveAgentIndex((prev) => Math.max(0, prev - 1))
              }
              disabled={activeAgentIndex === 0}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-xs font-bold text-slate-200 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <button
              onClick={() =>
                setActiveAgentIndex((prev) =>
                  Math.min(AGENTS.length - 1, prev + 1)
                )
              }
              disabled={activeAgentIndex === AGENTS.length - 1}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-xs font-bold text-slate-200 transition"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 max-w-2xl flex flex-col gap-2">
            <AttachChips files={customFiles} onRemove={(i) => setCustomFiles((p) => p.filter((_, j) => j !== i))} />
            <div className="flex items-center gap-3">
            <AttachButton files={customFiles} onChange={setCustomFiles} disabled={isCurrentAgentLocked || isGenerating} />
            <input
              type="text"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              disabled={isCurrentAgentLocked || isGenerating}
              placeholder={
                isCurrentAgentLocked
                  ? `Code is locked on the Free Plan — upgrade for ${STANDARD_PRICE_LABEL} to edit...`
                  : currentAgent.placeholder
              }
              className="select-text flex-1 min-w-[10rem] bg-[#090D16] border border-slate-800 rounded-xl px-4 py-2.5 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 disabled:opacity-50"
            />

            <button
              onClick={handleCustomizeAgent}
              disabled={isGenerating}
              className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-violet-600 to-cyan-500 hover:brightness-110 transition shadow-lg shadow-violet-600/20 flex items-center gap-2 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              {currentAgent.buttonLabel}
              {!isCurrentAgentLocked && (
                <span className="text-[10px] font-semibold opacity-80">
                  ({CUSTOMIZE_COST} Token)
                </span>
              )}
            </button>

            <button
              onClick={openVoiceEdit}
              title={`Talk to edit · ${VOICE_PRICE_LABEL} (${VOICE_TOKEN_LABEL})`}
              aria-label="Talk to edit"
              className="p-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 transition shrink-0"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
            </div>
          </div>
        </footer>
      </main>

      {domainOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Make your website online"
        >
          <button
            aria-label="Close"
            onClick={() => setDomainOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
          />
          <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-[#0D1322] border border-slate-800 shadow-2xl">
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-800 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-300 shrink-0" />
                  <h2 className="text-sm font-bold text-white">Make your website online</h2>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Follow these steps in order. Your progress is saved here.</p>
              </div>
              <button
                onClick={() => setDomainOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-2.5 border-b border-slate-800 flex items-center gap-3 shrink-0">
              <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${(doneCount / DOMAIN_STEPS.length) * 100}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-400 shrink-0">
                {doneCount}/{DOMAIN_STEPS.length} completed
              </span>
            </div>

            <div className="overflow-y-auto">
              {domainView === "steps" || !activeStep ? (
                <>
                  <ol className="px-5 py-4 space-y-4">
                    {DOMAIN_STEPS.map((step, i) => {
                      const done = doneSteps.includes(step.title);
                      const picked = step.options.find((o) => o.id === selectedOptions[step.title]);
                      return (
                        <li key={step.title} className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border text-[10px] font-bold flex items-center justify-center ${
                              done
                                ? "bg-emerald-500 border-emerald-500 text-slate-950"
                                : "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                            }`}
                          >
                            {done ? <Check className="w-3 h-3" /> : i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white">{step.title}</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{step.text}</p>
                            {picked && (
                              <p className="mt-1 text-[11px] font-semibold text-cyan-300">Selected: {picked.name}</p>
                            )}
                          </div>
                          <button
                            onClick={() => setDomainView(i)}
                            className={`shrink-0 self-start flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
                              done
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                                : "border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                            }`}
                          >
                            <span
                              className={`w-3 h-3 rounded-full border ${
                                done ? "border-emerald-400 bg-emerald-400" : "border-cyan-300/70"
                              }`}
                            />
                            {done ? "Completed" : "Complete step →"}
                          </button>
                        </li>
                      );
                    })}
                  </ol>

                  <section className="px-5 pb-5 pt-4 border-t border-slate-800">
                    <h3 className="text-xs font-bold text-white">Do it all in one place</h3>
                    <p className="mt-1 mb-3 text-[11px] leading-relaxed text-slate-400">
                      These providers cover most of the steps above (domain, hosting, DNS, HTTPS and deploy) in a single
                      account. A database and the final testing may still need an add-on or another tool.
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {ALL_IN_ONE.map((o, i) =>
                        optionCard(o, i, selectedOptions["all-in-one"] === o.id, () =>
                          setSelectedOptions((cur) => ({ ...cur, "all-in-one": o.id }))
                        )
                      )}
                    </ul>
                  </section>
                </>
              ) : (
                <>
                  <div className="px-5 pt-4">
                    <button
                      onClick={() => setDomainView("steps")}
                      className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white transition"
                    >
                      <ChevronLeft className="w-3 h-3" /> Back to steps
                    </button>
                    <p className="text-xs font-bold text-white">
                      Step {domainView + 1}: {activeStep.title}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">Choose the one you prefer</p>
                  </div>

                  <ul className="px-5 py-3 grid gap-2 sm:grid-cols-2">
                    {activeStep.options.map((o, i) =>
                      optionCard(o, i, selectedOptions[activeStep.title] === o.id, () =>
                        setSelectedOptions((cur) => ({ ...cur, [activeStep.title]: o.id }))
                      )
                    )}
                  </ul>

                  <div className="px-5 pb-5 flex flex-wrap items-center gap-3">
                    {doneSteps.includes(activeStep.title) ? (
                      <button
                        onClick={() => setStepDone(activeStep.title, false)}
                        className="px-4 py-2 rounded-lg border border-slate-700 text-[11px] font-bold text-slate-300 hover:bg-slate-800/70 transition"
                      >
                        Mark as not done
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setStepDone(activeStep.title, true);
                          setDomainView("steps");
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-500 text-[11px] font-bold text-slate-950 hover:brightness-110 transition"
                      >
                        I&apos;ve completed this step
                      </button>
                    )}
                    <span className="text-[10px] text-slate-500">
                      Selecting opens the website in a new tab. Come back and tap the green button when you are done.
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ProfileModal
        key={showProfile ? "open" : "closed"}
        open={showProfile}
        profile={profile}
        onClose={() => setShowProfile(false)}
        onSaved={(p) => {
          setProfile(p);
          router.refresh(); // every server page / API now sees the new name and photo
        }}
      />

      <BuildQuestions
        open={!!buildQuestions}
        idea={prompt}
        questions={buildQuestions || []}
        advanced={advancedMode}
        onCancel={() => setBuildQuestions(null)}
        onSubmit={handleAnswersSubmit}
      />

      <VoiceBuilder
        key={voiceMode}
        open={showVoice}
        mode={voiceMode}
        context={voiceContext}
        onClose={() => setShowVoice(false)}
        onApply={(text) => setPrompt(text.slice(0, 1000))}
        onApplyEdit={applyVoiceEdit}
        onBalanceChange={(n) => setTokenBalance(n)}
        onNeedTokens={() => {
          setShowVoice(false);
          setShowPricingModal(true);
        }}
      />

      {/* 4. FULL INTERACTIVE PRICING & EXTRA TOKEN MODAL */}

      {showPricingModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0E1424] border border-slate-800 rounded-3xl max-w-5xl w-full p-6 md:p-8 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5" /> Build_Core Plans & Token Billing
                </span>
                <h3 className="text-2xl font-extrabold text-white mt-1">
                  Unlock All 5 AI Agents or Top Up Extra Tokens ({TOKEN_PRICE_LABEL})
                </h3>
              </div>
              {tier !== "FREE" && (
                <button
                  onClick={handleManageSubscription}
                  disabled={billingLoading === "PORTAL"}
                  className="mr-3 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 disabled:opacity-50"
                >
                  {billingLoading === "PORTAL" ? "Opening..." : "Manage subscription"}
                </button>
              )}
              <button
                onClick={() => setShowPricingModal(false)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <PaymentMethodToggle value={provider} onChange={setProvider} />

            {/* 4 Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {PLAN_DETAILS.map((plan) => {
                const isCurrent = tier === plan.id;
                const isPopular = plan.id === "STANDARD" || plan.id === "PRO";
                return (
                  <div
                    key={plan.id}
                    className={`rounded-2xl p-5 flex flex-col justify-between border transition ${
                      plan.id === "PRO"
                        ? "bg-gradient-to-b from-violet-950/50 to-slate-900 border-violet-500 shadow-lg shadow-violet-500/10"
                        : plan.id === "STANDARD"
                        ? "bg-slate-900/90 border-amber-500/50"
                        : "bg-slate-900/50 border-slate-800"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-base text-white">
                          {plan.name}
                        </h4>
                        {isPopular && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {plan.id === "STANDARD" ? "Best Value" : "Popular"}
                          </span>
                        )}
                      </div>

                      <div className="my-3">
                        <span className="text-3xl font-extrabold text-white">
                          {plan.price}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">
                          {plan.period}
                        </span>
                      </div>

                      <div className="inline-block px-2.5 py-1 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[11px] font-bold mb-3">
                        {plan.badge}
                      </div>

                      <p className="text-xs text-slate-400 mb-4">{plan.desc}</p>

                      <ul className="space-y-2 text-xs text-slate-200 mb-6">
                        {plan.features.map((f, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => handleSelectPlan(plan.id)}
                      disabled={isCurrent || billingLoading === plan.id}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                        isCurrent
                          ? "bg-slate-800 text-slate-400 cursor-default"
                          : plan.id === "STANDARD"
                          ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:brightness-110"
                          : "bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110"
                      }`}
                    >
                      {billingLoading === plan.id
                        ? "Activating..."
                        : isCurrent
                        ? "Active Plan"
                        : `Select ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Extra Token Instant Top-Up Bar */}
            <div className="rounded-2xl bg-[#090D16] border border-amber-500/40 p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <Coins className="w-4 h-4" />
                  <span>Need More Tokens This Month? Buy Extra Tokens for {TOKEN_PRICE_LABEL} Each</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Finished your monthly plan tokens early? Top up extra tokens instantly at <strong>{TOKEN_PRICE_LABEL} per token</strong> without changing your subscription.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={extraTokensCount}
                    onChange={(e) =>
                      setExtraTokensCount(Math.max(1, Number(e.target.value)))
                    }
                    className="w-14 bg-transparent text-center font-bold text-sm text-white focus:outline-none"
                  />
                  <span className="text-xs text-slate-400 ml-1">Tokens</span>
                </div>

                <button
                  onClick={() => handleBuyExtraTokens(extraTokensCount)}
                  disabled={billingLoading === "TOPUP"}
                  className="px-5 py-2.5 rounded-xl font-extrabold text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-110 flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition"
                >
                  <Plus className="w-4 h-4" />
                  {billingLoading === "TOPUP"
                    ? "Adding..."
                    : `Buy for ${usd(extraTokensCount * TOKEN_PRICE_CENTS)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}