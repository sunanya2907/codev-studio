/**
 * Builds the HTML document for the "Live Preview" iframe.
 *
 * The generated frontend (a TSX component) is compiled and RUN inside a sandboxed
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

const REACT_URL = "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js";
const REACT_DOM_URL = "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js";
const BABEL_URL = "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.4/babel.min.js";
const TAILWIND_URL = "https://cdn.tailwindcss.com/3.4.16";

/** JSON that is safe to embed inside an inline <script> block. */
function toScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Runs inside the iframe. Plain ES2017, no template literals needed from the outside.
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
  var source = window.__PREVIEW_SOURCE__;

  // ---- module shims -------------------------------------------------------
  function passthrough(props) { return props && props.children != null ? props.children : null; }

  function Icon(props) {
    var size = (props && (props.size || props.width)) || 24;
    return React.createElement("svg", {
      width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
      strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
      className: props && props.className, "aria-hidden": "true"
    }, React.createElement("rect", { x: 4, y: 4, width: 16, height: 16, rx: 4 }));
  }

  function Link(props) {
    var p = {};
    for (var k in props) if (k !== "href" && k !== "prefetch" && k !== "replace" && k !== "scroll") p[k] = props[k];
    p.href = "#";
    var userClick = props.onClick;
    p.onClick = function (e) { e.preventDefault(); if (userClick) userClick(e); };
    return React.createElement("a", p, props.children);
  }

  function NextImage(props) {
    var p = {};
    for (var k in props) if (k !== "fill" && k !== "priority" && k !== "quality" && k !== "placeholder" && k !== "blurDataURL" && k !== "unoptimized") p[k] = props[k];
    if (!p.alt) p.alt = "";
    return React.createElement("img", p);
  }

  var noop = function () {};
  var router = { push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop };

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
      usePathname: function () { return "/"; },
      useSearchParams: function () { return new URLSearchParams(); },
      useParams: function () { return {}; },
      redirect: noop, notFound: noop
    },
    "next/head": { __esModule: true, default: passthrough },
    "next-auth/react": {
      useSession: function () { return { data: null, status: "unauthenticated" }; },
      signIn: noop, signOut: noop, SessionProvider: passthrough
    },
    "lucide-react": new Proxy({}, {
      get: function (_t, key) { return key === "__esModule" ? false : Icon; }
    })
  };

  var localRequire = function (name) {
    if (Object.prototype.hasOwnProperty.call(modules, name)) return modules[name];
    return stubModule(name);
  };

  // ---- compile ------------------------------------------------------------
  var compiled;
  try {
    compiled = window.Babel.transform(source, {
      filename: "app.tsx",
      presets: [["typescript", { isTSX: true, allExtensions: true }], "react"],
      plugins: ["transform-modules-commonjs"],
      sourceType: "module"
    }).code;
  } catch (err) {
    showError("The generated code could not be compiled", String(err && err.message ? err.message : err));
    return;
  }

  // ---- run ----------------------------------------------------------------
  var mod = { exports: {} };
  try {
    new Function("require", "module", "exports", "React", compiled)(localRequire, mod, mod.exports, React);
  } catch (err) {
    showError("The generated code threw while loading", String(err && err.stack ? err.stack : err));
    return;
  }

  var exp = mod.exports || {};
  var Component = exp.default;
  if (typeof Component !== "function" && !(Component && typeof Component === "object")) {
    for (var key in exp) {
      if (typeof exp[key] === "function" && /^[A-Z]/.test(key)) { Component = exp[key]; break; }
    }
  }
  if (!Component) {
    showError("Nothing to preview",
      "The frontend code does not export a React component (expected: export default function App() { ... }).");
    return;
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
      }, "The generated app crashed while rendering:\n\n" + String(this.state.error && this.state.error.message || this.state.error));
    }
    return this.props.children;
  };

  window.addEventListener("error", function (e) {
    if (e && e.message && !/ResizeObserver/.test(e.message)) console.error(e.message);
  });

  window.ReactDOM.createRoot(root).render(
    React.createElement(Boundary, null, React.createElement(Component))
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
    "script-src 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com",
    "style-src 'unsafe-inline' https://cdn.tailwindcss.com",
    "img-src data: blob: https:",
    "font-src data: https:",
    "connect-src 'none'",
  ].join("; ");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
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
    <script>window.__PREVIEW_SOURCE__ = ${toScriptJson(frontendCode)};</script>
    <script>${RUNTIME}</script>
  </body>
</html>`;
}
