// Fixed project files so the exported ZIP is a project you can run (npm install && npm run dev).
import type { GenFile } from "@/lib/files";

export function scaffoldFiles(appName: string): GenFile[] {
  const name =
    appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "my-app";
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name,
          version: "0.1.0",
          private: true,
          scripts: {
            dev: "next dev",
            build: "prisma generate && next build",
            start: "next start",
            postinstall: "prisma generate",
          },
          dependencies: {
            "@prisma/client": "^5.22.0",
            bcryptjs: "^2.4.3",
            jose: "^5.9.6",
            "lucide-react": "^0.468.0",
            next: "^15.1.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
            zod: "^3.24.1",
          },
          devDependencies: {
            "@types/bcryptjs": "^2.4.6",
            "@types/node": "^20.17.0",
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
            autoprefixer: "^10.4.20",
            postcss: "^8.4.49",
            prisma: "^5.22.0",
            tailwindcss: "^3.4.17",
            typescript: "^5.7.0",
          },
        },
        null,
        2
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2
      ),
    },
    { path: "next.config.mjs", content: "/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n" },
    { path: "postcss.config.mjs", content: "export default {\n  plugins: { tailwindcss: {}, autoprefixer: {} },\n};\n" },
    {
      path: "tailwind.config.ts",
      content:
        'import type { Config } from "tailwindcss";\n\nconst config: Config = {\n  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],\n  theme: { extend: {} },\n  plugins: [],\n};\nexport default config;\n',
    },
    {
      path: "app/globals.css",
      content:
        "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nhtml, body { background: #0b0f19; color: #e2e8f0; }\n",
    },
    {
      path: "app/layout.tsx",
      content: `import "./globals.css";\nimport type { Metadata, Viewport } from "next";\nimport type { ReactNode } from "react";\nimport PwaRegister from "@/components/PwaRegister";\n\nexport const metadata: Metadata = {\n  title: ${JSON.stringify(appName || "My App")},\n  manifest: "/manifest.webmanifest",\n  appleWebApp: { capable: true, title: ${JSON.stringify(appName || "My App")}, statusBarStyle: "black-translucent" },\n};\n\nexport const viewport: Viewport = { themeColor: "#0b0f19", width: "device-width", initialScale: 1 };\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return (\n    <html lang="en">\n      <body>\n        {children}\n        <PwaRegister />\n      </body>\n    </html>\n  );\n}\n`,
    },
    {
      path: "components/PwaRegister.tsx",
      content:
        '"use client";\nimport { useEffect } from "react";\n\n// Registers the service worker so the site can be installed on a phone ("Add to Home screen").\nexport default function PwaRegister() {\n  useEffect(() => {\n    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {\n      navigator.serviceWorker.register("/sw.js").catch(() => {});\n    }\n  }, []);\n  return null;\n}\n',
    },
    {
      path: "public/manifest.webmanifest",
      content: JSON.stringify(
        {
          name: appName || "My App",
          short_name: (appName || "My App").slice(0, 12),
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#0b0f19",
          theme_color: "#0b0f19",
          icons: [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
          ],
        },
        null,
        2
      ),
    },
    {
      path: "public/icon.svg",
      content:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0b0f19"/><circle cx="256" cy="256" r="150" fill="#2563eb"/><circle cx="256" cy="256" r="60" fill="#fff"/></svg>\n',
    },
    {
      path: "public/sw.js",
      content:
        '// Minimal service worker: makes the app installable. It never caches API calls or pages (private data),\n// it only shows /offline.html when the network is down.\nself.addEventListener("install", (e) => {\n  self.skipWaiting();\n  e.waitUntil(caches.open("offline-v1").then((c) => c.add("/offline.html")).catch(() => {}));\n});\nself.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));\nself.addEventListener("fetch", (event) => {\n  if (event.request.mode !== "navigate") return;\n  event.respondWith(\n    fetch(event.request).catch(() => caches.open("offline-v1").then((c) => c.match("/offline.html")).then((r) => r || new Response("Offline", { status: 503 })))\n  );\n});\n',
    },
    {
      path: "public/offline.html",
      content:
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0b0f19;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center"><div><h1>You are offline</h1><p>Check your internet connection and try again.</p><button onclick="location.reload()" style="padding:10px 18px;border-radius:10px;border:0;background:#2563eb;color:#fff;font-size:16px">Retry</button></div>\n',
    },
    {
      path: "capacitor.config.json",
      content: JSON.stringify(
        {
          appId: "com.example." + name.replace(/-/g, "").slice(0, 24),
          appName: appName || "My App",
          webDir: "public",
          server: { url: "https://YOUR-DEPLOYED-SITE.vercel.app", cleartext: false },
          android: { allowMixedContent: false },
        },
        null,
        2
      ),
    },
    {
      path: "MOBILE_APK.md",
      content: MOBILE_APK_MD(appName || "My App"),
    },
    {
      path: "lib/db.ts",
      content:
        'import { PrismaClient } from "@prisma/client";\n\nconst g = globalThis as unknown as { prisma?: PrismaClient };\nexport const db = g.prisma ?? new PrismaClient();\nif (process.env.NODE_ENV !== "production") g.prisma = db;\n',
    },
    {
      path: ".env.example",
      content:
        'DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"\n# Any long random text, used to sign login cookies\nSESSION_SECRET="change-me-to-a-long-random-string"\n',
    },
    { path: ".gitignore", content: "node_modules\n.next\n.env\n.env.local\nnext-env.d.ts\n" },
    {
      path: "README.md",
      content: `# ${appName || "My App"}\n\nGenerated by Build_Core. Docs: see SRS.md (requirements) and QA_REPORT.md (review and deploy checklist). Want an Android app? See MOBILE_APK.md.\n\n## Run it\n\n1. \`npm install\`\n2. Copy \`.env.example\` to \`.env\` and fill in DATABASE_URL (any PostgreSQL, e.g. Neon) and SESSION_SECRET\n3. \`npx prisma db push\`\n4. \`npm run dev\` and open http://localhost:3000\n\n## Deploy\n\nPush to GitHub and import the repo in Vercel. Add DATABASE_URL and SESSION_SECRET as environment variables.\n\nAI-generated code: read QA_REPORT.md and test before real use.\n`,
    },
  ];
}

const MOBILE_APK_MD = (appName: string) => `# Turn ${appName} into an Android app (APK)

The app is a Next.js website with a server and database, so the Android app is a native shell (Capacitor)
that opens your DEPLOYED site. You build the APK yourself with Android Studio.

## 0. Install it as an app without any APK (PWA)
Deploy the site to Vercel (HTTPS). Open it in Chrome on Android -> menu -> "Install app" / "Add to Home screen".
This already works. It cannot track location with the screen off - for that use the APK below.

## 1. Deploy the website
Push to GitHub, import in Vercel, set DATABASE_URL and SESSION_SECRET, run \`npx prisma db push\`.

## 2. Point the app at your site
Edit \`capacitor.config.json\`: set \`server.url\` to your real https URL and change \`appId\` to your own
(for example com.yourcompany.appname). The appId can never change after you publish.

## 3. Install Capacitor and add Android
\`\`\`
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor-community/background-geolocation
npx cap add android
npx cap sync android
\`\`\`
(Needs Node 20+, Android Studio and a JDK.)

## 4. Allow background location (only if the app tracks location)
Open android/app/src/main/AndroidManifest.xml and add inside <manifest>:
\`\`\`
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
\`\`\`
and add the plugin's service inside <application> as described at
https://github.com/capacitor-community/background-geolocation (README, "Android" section).
The generated /track page already uses this plugin automatically when it runs inside the app.

## 5. Build and test
\`\`\`
npx cap open android
\`\`\`
In Android Studio press Run (phone or emulator). Build -> Generate Signed Bundle / APK for a release file.

## 6. Icons
public/icon.svg is a placeholder. Replace it with your logo and generate Android icons with
\`npx @capacitor/assets generate --android\` (needs assets/icon-only.png, 1024x1024).

## Publishing on Google Play - things to know
- Apps that only wrap a website can be rejected ("minimum functionality"). Add native value such as background location, notifications or offline screens.
- Background location needs a Play Console "location permissions" declaration, a prominent in-app disclosure and a privacy policy URL.
- Health / medical apps need a privacy policy, a data-safety form and must not give medical advice or claim certification.
- Personal location and health data are regulated (India DPDP Act, GDPR, HIPAA and others). Get legal review before real users.
`;
