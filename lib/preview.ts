/**
 * Builds the HTML document for the "Live Preview" iframe.
 *
 * The generated frontend (SEVERAL TSX files: pages, components, helpers) is compiled and RUN inside a sandboxed
 * iframe (sandbox="allow-scripts", no same-origin => it can't touch this site's
 * cookies, storage or session). Inside the iframe:
 *   1. @babel/standalone turns TSX + ES modules into plain JS (CommonJS),
 *   2. imports are resolved through a tiny `require` shim (react, next/link,
 *      next/image, next/navigation, next-auth/react, lucide-react, ...). Anything
 *      else becomes a harmless stub and is listed in a notice banner,
 *   3. the default export is mounted with React 18 (UMD) inside an error boundary,
 *      so a bad generation shows a readable error instead of a blank pane.
 *
 * The preview's React is independent of the app's own React version.
 */

import { parseFiles } from "@/lib/files";

const REACT_URL = "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js";
const REACT_DOM_URL = "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js";
const BABEL_URL = "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.4/babel.min.js";
const TAILWIND_URL = "https://cdn.tailwindcss.com/3.4.16";
const LUCIDE_URL = "https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js";
const LUCIDE_FALLBACK_URL = "https://cdnjs.cloudflare.com/ajax/libs/lucide/0.468.0/lucide.min.js";


/**
 * The preview iframe has no same-origin access, so the browser throws a SecurityError the moment a
 * generated app touches localStorage / sessionStorage / document.cookie (that was the
 * "The document is sandboxed and lacks the allow-same-origin flag" crash). This shim runs FIRST and
 * swaps in in-memory versions, so those apps run normally (data lasts until the preview reloads).
 */
const STORAGE_SHIM = `(function () {
  function makeStore() {
    var data = {};
    return {
      get length() { return Object.keys(data).length; },
      key: function (i) { return Object.keys(data)[i] || null; },
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); },
      removeItem: function (k) { delete data[String(k)]; },
      clear: function () { data = {}; }
    };
  }
  ["localStorage", "sessionStorage"].forEach(function (name) {
    var ok = false;
    try { ok = !!window[name]; } catch (e) { ok = false; }
    if (ok) return;
    try { Object.defineProperty(window, name, { value: makeStore(), configurable: true }); } catch (e) {}
  });
  var cookieOk = true;
  try { void document.cookie; } catch (e) { cookieOk = false; }
  if (!cookieOk) {
    var jar = {};
    try {
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get: function () { return Object.keys(jar).map(function (k) { return k + "=" + jar[k]; }).join("; "); },
        set: function (v) { var p = String(v).split(";")[0], i = p.indexOf("="); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
      });
    } catch (e) {}
  }
})();`;

/** JSON that is safe to embed inside an inline <script> block. */
function toScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Runs inside the iframe. Plain ES2017 (no template literals or backticks in here).
const RUNTIME = String.raw`
(function () {
  var root = document.getElementById("root");
  var notices = [];

  function showError(title, detail) {
    root.innerHTML = "";
    var box = document.createElement("div");
    box.style.cssText = "margin:24px;padding:16px 18px;border:1px solid #7f1d1d;background:#1c0a0a;color:#fecaca;border-radius:12px;font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word";
    var h = document.createElement("div");
    h.style.cssText = "font:700 14px system-ui,sans-serif;color:#fca5a5;margin-bottom:8px";
    h.textContent = title;
    box.appendChild(h);
    box.appendChild(document.createTextNode(detail));
    root.appendChild(box);
  }

  if (!window.React || !window.ReactDOM || !window.Babel) {
    showError("Preview libraries could not be loaded",
      "The preview needs to download React and Babel from cdnjs.cloudflare.com. Check your internet connection or ad/script blocker and reload.");
    return;
  }

  var React = window.React;

  // The preview has no backend (network access is blocked on purpose). Write requests (login, register, save...)
  // are answered with a simulated success so those buttons respond. Read requests still fail like offline.
  window.fetch = function (input, init) {
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") {
      return Promise.reject(new TypeError("Preview has no backend"));
    }
    var body = JSON.stringify({
      ok: true, success: true, message: "Simulated in preview",
      user: { id: "preview-user", name: "Preview User", email: "preview@example.com" }, token: "preview-token"
    });
    return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
  };
  var files = window.__PREVIEW_FILES__ || {};
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  // ---- in-preview navigation (next/link, useRouter, usePathname) ------------
  var currentPath = "/";
  var currentParams = {};
  var navSubs = [];
  function navigate(href) {
    if (href && typeof href === "object") href = href.pathname;
    if (typeof href !== "string") return;
    var p = href.split("#")[0].split("?")[0];
    if (p === "" || /^[a-z][a-z0-9+.-]*:/i.test(p)) return;
    if (p.charAt(0) !== "/") p = "/" + p;
    if (p.length > 1) p = p.replace(/\/+$/, "");
    currentPath = p;
    for (var i = 0; i < navSubs.length; i++) navSubs[i]();
  }

  // ---- module shims -------------------------------------------------------
  function passthrough(props) { return props && props.children != null ? props.children : null; }

  // ---- icons: real lucide icons (loaded from cdnjs), square placeholder only if one is missing ----
  var lucideIcons = (window.lucide && window.lucide.icons) || {};
  var ICON_ALIASES = {
    Home: "House", Edit: "SquarePen", Edit2: "Pen", Edit3: "PenLine", CheckCircle: "CircleCheckBig",
    CheckCircle2: "CircleCheck", AlertCircle: "CircleAlert", AlertTriangle: "TriangleAlert", XCircle: "CircleX",
    HelpCircle: "CircleHelp", BarChart: "ChartNoAxesColumn", BarChart2: "ChartNoAxesColumn", BarChart3: "ChartColumn",
    LineChart: "ChartLine", PieChart: "ChartPie", Unlock: "LockOpen", Loader2: "LoaderCircle", Filter: "Funnel",
    MoreHorizontal: "Ellipsis", MoreVertical: "EllipsisVertical", Slack: "Hash", Github: "Code", Twitter: "Share2"
  };
  function findIcon(key) {
    key = String(key);
    var base = key.replace(/^Lucide/, "").replace(/Icon$/, "");
    var tries = [key, base, ICON_ALIASES[base]];
    for (var i = 0; i < tries.length; i++) {
      if (tries[i] && hasOwn(lucideIcons, tries[i]) && Array.isArray(lucideIcons[tries[i]])) return lucideIcons[tries[i]];
    }
    return null;
  }
  function camel(n) { return n.replace(/-([a-z])/g, function (_m, c) { return c.toUpperCase(); }); }
  function makeIcon(key) {
    var node = findIcon(key);
    return function Icon(props) {
      props = props || {};
      var size = props.size || props.width || 24;
      var attrs = {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: props.color || "currentColor",
        strokeWidth: props.strokeWidth || 2, strokeLinecap: "round", strokeLinejoin: "round",
        className: props.className ? "lucide " + props.className : "lucide", "aria-hidden": "true",
        style: props.style, onClick: props.onClick
      };
      var kids;
      if (node) {
        kids = node.map(function (part, i) {
          var a = { key: i };
          var src = part[1] || {};
          for (var k in src) a[camel(k)] = src[k];
          return React.createElement(part[0], a);
        });
      } else {
        kids = []; // unknown icon: draw nothing instead of a placeholder box
      }
      return React.createElement.apply(React, ["svg", attrs].concat(kids));
    };
  }
  var iconCache = {};

  function Link(props) {
    var p = {};
    for (var k in props) if (k !== "href" && k !== "prefetch" && k !== "replace" && k !== "scroll") p[k] = props[k];
    var target = props.href && typeof props.href === "object" ? props.href.pathname : props.href;
    p.href = typeof target === "string" ? target : "#";
    var userClick = props.onClick;
    p.onClick = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (userClick) userClick(e);
      navigate(props.href);
    };
    return React.createElement("a", p, props.children);
  }

  function NextImage(props) {
    var p = {};
    for (var k in props) if (k !== "fill" && k !== "priority" && k !== "quality" && k !== "placeholder" && k !== "blurDataURL" && k !== "unoptimized") p[k] = props[k];
    if (!p.alt) p.alt = "";
    return React.createElement("img", p);
  }

  var noop = function () {};
  var router = { push: navigate, replace: navigate, back: noop, forward: noop, refresh: noop, prefetch: noop };

  function stubModule(name) {
    if (notices.indexOf(name) === -1) notices.push(name);
    var fn = function () { return null; };
    return new Proxy(fn, {
      get: function (_t, key) {
        if (key === "__esModule") return false;
        if (key === "default") return passthrough;
        return passthrough;
      },
      apply: function () { return null; }
    });
  }

  var modules = {
    "react": React,
    "react-dom": window.ReactDOM,
    "react-dom/client": window.ReactDOM,
    "react/jsx-runtime": { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment },
    "next/link": { __esModule: true, default: Link },
    "next/image": { __esModule: true, default: NextImage },
    "next/navigation": {
      useRouter: function () { return router; },
      usePathname: function () { return currentPath; },
      useSearchParams: function () { return new URLSearchParams(); },
      useParams: function () { return currentParams; },
      redirect: noop, notFound: noop
    },
    "next/head": { __esModule: true, default: passthrough },
    "next/font/google": new Proxy({}, {
      get: function (_t, key) {
        return key === "__esModule" ? false : function () { return { className: "", style: {}, variable: "" }; };
      }
    }),
    "next-auth/react": {
      useSession: function () { return { data: null, status: "unauthenticated" }; },
      signIn: function (provider, opts) {
        var o = opts && typeof opts === "object" ? opts : {};
        var okResult = { ok: true, error: null, status: 200, url: "/" };
        if (typeof provider === "string") {
          // signIn("credentials" | "google" | ...): the preview signs the visitor in right away.
          if (o.redirect !== false) navigate(o.callbackUrl || (matchPage("/dashboard") ? "/dashboard" : "/"));
          return Promise.resolve(okResult);
        }
        var cands = ["/login", "/signin", "/sign-in", "/auth/login", "/auth/signin", "/auth"];
        for (var i = 0; i < cands.length; i++) { if (matchPage(cands[i])) { navigate(cands[i]); break; } }
        return Promise.resolve(okResult);
      },
      signOut: function () { navigate("/"); return Promise.resolve(undefined); },
      SessionProvider: passthrough
    },
    "lucide-react": new Proxy({}, {
      get: function (_t, key) {
        if (key === "__esModule") return false;
        if (typeof key !== "string") return undefined;
        return iconCache[key] || (iconCache[key] = makeIcon(key));
      }
    })
  };

  // ---- tiny module system over the generated files -------------------------
  var EXT = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
  var cache = {};

  function normPath(p) {
    var out = [];
    p.split("/").forEach(function (seg) {
      if (!seg || seg === ".") return;
      if (seg === "..") out.pop(); else out.push(seg);
    });
    return out.join("/");
  }
  function dirOf(p) { var i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); }

  function resolveLocal(from, spec) {
    var bases = [];
    if (spec.indexOf("@/") === 0) { var b = normPath(spec.slice(2)); bases.push(b, "src/" + b); }
    else if (spec.charAt(0) === ".") bases.push(normPath(dirOf(from) + "/" + spec));
    else return null;
    for (var i = 0; i < bases.length; i++)
      for (var j = 0; j < EXT.length; j++)
        if (hasOwn(files, bases[i] + EXT[j])) return bases[i] + EXT[j];
    return null;
  }

  function makeRequire(from) {
    return function (name) {
      if (hasOwn(modules, name)) return modules[name];
      if (/\.(css|scss|sass)$/.test(name)) return {};
      var local = resolveLocal(from, name);
      if (local) return loadFile(local);
      return stubModule(name);
    };
  }

  function loadFile(path) {
    if (cache[path]) return cache[path].exports;
    var mod = { exports: {} };
    cache[path] = mod;
    if (/\.json$/.test(path)) { mod.exports = JSON.parse(files[path]); return mod.exports; }
    var compiled;
    try {
      compiled = window.Babel.transform(files[path], {
        filename: path,
        presets: [["typescript", { isTSX: true, allExtensions: true }], "react"],
        plugins: ["transform-modules-commonjs"],
        sourceType: "module"
      }).code;
    } catch (err) {
      throw new Error("Could not compile " + path + ":\n" + String(err && err.message ? err.message : err));
    }
    try {
      new Function("require", "module", "exports", "React", compiled)(makeRequire(path), mod, mod.exports, React);
    } catch (err) {
      throw new Error("Error while loading " + path + ":\n" + String(err && err.message ? err.message : err));
    }
    return mod.exports;
  }

  // ---- routing: app/**/page.tsx --------------------------------------------
  function matchPage(path) {
    var segs = path === "/" ? [] : path.slice(1).split("/");
    var best = null;
    Object.keys(files).forEach(function (k) {
      if (!/^(src\/)?app\/(.*\/)?page\.(tsx|jsx|ts|js)$/.test(k)) return;
      var rel = k.replace(/^(src\/)?app\//, "").replace(/(^|\/)page\.(tsx|jsx|ts|js)$/, "");
      var parts = rel ? rel.split("/") : [];
      parts = parts.filter(function (x) { return !/^\(.*\)$/.test(x); });
      if (parts.length !== segs.length) return;
      var params = {}, dyn = 0, ok = true;
      for (var i = 0; i < parts.length; i++) {
        var m = parts[i].match(/^\[\.*([^\]]+)\]$/);
        if (m) { params[m[1]] = segs[i]; dyn++; }
        else if (parts[i] !== segs[i]) { ok = false; break; }
      }
      if (ok && (!best || dyn < best.dyn)) best = { file: k, params: params, dyn: dyn };
    });
    if (!best && path === "/") {
      var any = Object.keys(files).filter(function (k) { return /\.(tsx|jsx)$/.test(k); })[0];
      if (any) best = { file: any, params: {}, dyn: 0 };
    }
    return best;
  }

  function pickComponent(exp) {
    var C = exp && exp.default;
    if (typeof C === "function" || (C && typeof C === "object")) return C;
    for (var key in exp) {
      if (typeof exp[key] === "function" && /^[A-Z]/.test(key)) return exp[key];
    }
    return null;
  }

  // ---- mount --------------------------------------------------------------
  function Boundary(props) {
    React.Component.call(this, props);
    this.state = { error: null };
  }
  Boundary.prototype = Object.create(React.Component.prototype);
  Boundary.prototype.constructor = Boundary;
  Boundary.getDerivedStateFromError = function (error) { return { error: error }; };
  Boundary.prototype.render = function () {
    if (this.state.error) {
      return React.createElement("pre", {
        style: { margin: 24, padding: "16px 18px", border: "1px solid #7f1d1d", background: "#1c0a0a", color: "#fecaca", borderRadius: 12, font: "13px/1.5 ui-monospace,Menlo,monospace", whiteSpace: "pre-wrap" }
      }, "The generated app crashed:\n\n" + String(this.state.error && this.state.error.message || this.state.error));
    }
    return this.props.children;
  };

  function PreviewApp() {
    var st = React.useState(0);
    var setTick = st[1];
    React.useEffect(function () {
      var f = function () { setTick(function (n) { return n + 1; }); };
      navSubs.push(f);
      return function () { navSubs.splice(navSubs.indexOf(f), 1); };
    }, []);

    var m = matchPage(currentPath);
    if (!m) {
      return React.createElement("pre", {
        style: { margin: 24, padding: "16px 18px", border: "1px solid #334155", background: "#0f172a", color: "#cbd5e1", borderRadius: 12, font: "13px/1.5 ui-monospace,Menlo,monospace", whiteSpace: "pre-wrap" }
      }, "No page exists for " + currentPath + " in this app.\nPages found: " + (Object.keys(files).filter(function (k) { return /page\.(tsx|jsx)$/.test(k); }).join(", ") || "none"));
    }
    currentParams = m.params;
    var Component = pickComponent(loadFile(m.file));
    if (!Component) throw new Error(m.file + " does not export a React component (expected: export default function Page() { ... }).");
    return React.createElement(Component, { key: currentPath, params: m.params, searchParams: {} });
  }

  if (!Object.keys(files).length) {
    showError("Nothing to preview", "The frontend has no files yet. Click Build App.");
    return;
  }

  // Plain <a href="/page"> links and <form> submits would otherwise navigate (and blank) the iframe.
  document.addEventListener("click", function (e) {
    if (!e || e.defaultPrevented) return;
    var el = e.target;
    while (el && el.nodeType === 1 && el.tagName !== "A") el = el.parentNode;
    if (!el || el.nodeType !== 1 || !el.getAttribute) return;
    var href = el.getAttribute("href");
    if (href == null) return;
    e.preventDefault();
    if (href.charAt(0) === "#") {
      var t = href.length > 1 ? document.getElementById(href.slice(1)) : null;
      if (t && t.scrollIntoView) t.scrollIntoView({ behavior: "smooth" });
      return;
    }
    navigate(href);
  });
  document.addEventListener("submit", function (e) { if (e && !e.defaultPrevented) e.preventDefault(); });

  window.addEventListener("error", function (e) {
    if (e && e.message && !/ResizeObserver/.test(e.message)) console.error(e.message);
  });

  window.ReactDOM.createRoot(root).render(
    React.createElement(Boundary, null, React.createElement(PreviewApp))
  );

  if (notices.length) {
    var bar = document.createElement("div");
    bar.style.cssText = "position:fixed;left:8px;bottom:8px;max-width:calc(100% - 16px);padding:6px 10px;border-radius:8px;background:#1e293bcc;color:#cbd5e1;font:11px system-ui,sans-serif;z-index:2147483647";
    bar.textContent = "Not available in preview (stubbed): " + notices.join(", ");
    document.body.appendChild(bar);
  }
})();
`;

export function buildPreviewHtml(frontendCode: string): string {
  // Scripts only from the pinned CDNs; no network access (connect-src 'none') so the
  // previewed code can't call APIs or send data anywhere.
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com",
    "style-src 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com",
    "img-src data: blob: https:",
    "font-src data: https:",
    "connect-src 'none'",
  ].join("; ");

  const fileMap: Record<string, string> = {};
  for (const f of parseFiles(frontendCode, "app/page.tsx")) fileMap[f.path] = f.content;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <script>${STORAGE_SHIM}</script>
    <script src="${TAILWIND_URL}"></script>
    <style>
      html, body { margin: 0; min-height: 100%; background: #090d16; color: #fff; font-family: system-ui, sans-serif; }
      #boot { padding: 24px; color: #64748b; font-size: 13px; }
    </style>
  </head>
  <body>
    <div id="root"><div id="boot">Starting preview…</div></div>
    <script src="${REACT_URL}"></script>
    <script src="${REACT_DOM_URL}"></script>
    <script src="${BABEL_URL}"></script>
    <script src="${LUCIDE_URL}"></script>
    <script>if(!window.lucide){document.write('<scr'+'ipt src="${LUCIDE_FALLBACK_URL}"></scr'+'ipt>')}</script>
    <script>window.__PREVIEW_FILES__ = ${toScriptJson(fileMap)};</script>
    <script>${RUNTIME}</script>
  </body>
</html>`;
}