// Post-build JavaScript obfuscation for the browser bundles.
//
// Usage:  npm run build:secure
//
// Obfuscates every .js file in .next/static/chunks (client code only; server
// code is never sent to browsers). Framework/runtime chunks are skipped because
// obfuscating them tends to break Next.js. Options are deliberately
// conservative: heavy options (control-flow flattening, self-defending, dead
// code injection) slow the app and often break React hydration.
//
// ALWAYS test the obfuscated build (npm start) before deploying. If a page
// breaks, add that chunk's name to SKIP below.

import fs from "node:fs";
import path from "node:path";
import JavaScriptObfuscator from "javascript-obfuscator";

const ROOT = path.join(process.cwd(), ".next", "static");
const SKIP = [/framework/, /main-app/, /main-/, /polyfills/, /webpack/, /turbopack/, /runtime/, /react-refresh/];

const OPTIONS = {
  compact: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false, // keep false: renaming globals breaks Next.js
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ["base64"],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  numbersToExpressions: false,
  simplify: true,
  sourceMap: false,
  target: "browser",
};

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".js")) yield p;
  }
}

if (!fs.existsSync(ROOT)) {
  console.error("No .next/static found. Run `next build` first.");
  process.exit(1);
}

let done = 0;
let skipped = 0;
for (const file of walk(ROOT)) {
  const base = path.basename(file);
  if (SKIP.some((re) => re.test(base))) {
    skipped++;
    continue;
  }
  const src = fs.readFileSync(file, "utf8");
  try {
    fs.writeFileSync(file, JavaScriptObfuscator.obfuscate(src, OPTIONS).getObfuscatedCode());
    done++;
  } catch (err) {
    console.error(`Skipped ${base}: ${err.message}`);
    skipped++;
  }
}
console.log(`Obfuscated ${done} client chunks, skipped ${skipped}.`);
