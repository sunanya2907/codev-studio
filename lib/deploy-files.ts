// Extra files in every exported / pushed project so it can be hosted ANYWHERE the person likes after it is on GitHub:
//   Dockerfile + docker-compose.yml  any VPS or server (Hostinger VPS, GoDaddy VPS, DigitalOcean, AWS ...), Fly.io, Railway, Coolify
//   render.yaml                      Render (one-click Blueprint, creates the database too)
//   Procfile                         Railway / Heroku-style hosts
//   DEPLOY.md                        step by step for each platform
// (Vercel uses the "vercel-build" script in package.json.)
import type { GenFile } from "@/lib/files";

export function deployFiles(appName: string): GenFile[] {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "my-app";

  const dockerfile = `FROM node:20-bookworm-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 3000
# On every start: create/update the database tables, make sure the admin exists, then run the site.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node prisma/seed.mjs; npm run start"]
`;

  const dockerignore = `node_modules
.next
.git
.env
.env.local
npm-debug.log
`;

  const compose = `# Runs the website AND its PostgreSQL database with one command:  docker compose up -d --build
# Put SESSION_SECRET and ADMIN_EMAIL in a file named .env next to this file (see .env.example).
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://app:app@db:5432/app
      SESSION_SECRET: \${SESSION_SECRET:?Set SESSION_SECRET in .env}
      ADMIN_EMAIL: \${ADMIN_EMAIL:-admin@example.com}
      ADMIN_PASSWORD: \${ADMIN_PASSWORD:-ChangeMe123!}
      NEXT_PUBLIC_APP_URL: \${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    volumes:
      - dbdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped
volumes:
  dbdata:
`;

  const render = `# Render Blueprint: Render reads this file, creates the website and a PostgreSQL database, and links them.
databases:
  - name: ${slug}-db
    plan: free
services:
  - type: web
    name: ${slug}
    runtime: node
    plan: free
    buildCommand: npm install && npx prisma generate && npm run build
    startCommand: npx prisma db push --skip-generate && node prisma/seed.mjs; npm run start
    envVars:
      - key: NODE_VERSION
        value: 20
      - key: DATABASE_URL
        fromDatabase:
          name: ${slug}-db
          property: connectionString
      - key: SESSION_SECRET
        generateValue: true
      - key: ADMIN_EMAIL
        sync: false
`;

  const procfile = `web: npx prisma db push --skip-generate && node prisma/seed.mjs; npm run start
`;

  const guide = `# Put this website online (any host)

The code is on GitHub. A host only needs to do 3 things: install, build, and run it with a PostgreSQL database.
Every host below needs the same 3 settings (environment variables):

- DATABASE_URL  : address of a PostgreSQL database (free ones: Neon, Supabase, or the host's own database)
- SESSION_SECRET: any long random text (32+ characters)
- ADMIN_EMAIL   : your email. The administrator account is created for this email.
  (Optional ADMIN_PASSWORD sets its first password; the default is ChangeMe123! - change it after your first login.)

After it runs, open /admin/login and sign in with ADMIN_EMAIL.

## Vercel (easiest)
1. vercel.com/new -> import the GitHub repository.
2. Add DATABASE_URL, SESSION_SECRET and ADMIN_EMAIL.
3. Deploy. The tables and the admin account are created automatically during the build (script "vercel-build").

## Render
1. render.com -> New -> Blueprint -> pick the GitHub repository (the file render.yaml does the rest).
2. Enter ADMIN_EMAIL when asked. The database and SESSION_SECRET are created for you.
3. Apply. (Render's free database is deleted after 30 days: upgrade it or use Neon for long-term use.)

## Railway
1. railway.com -> New Project -> Deploy from GitHub repo.
2. Add a PostgreSQL database to the project, then in the website service set DATABASE_URL to the database's connection URL, plus SESSION_SECRET and ADMIN_EMAIL.
3. Deploy. The Procfile creates the tables on every start.

## Netlify, Cloudflare Pages, other serverless hosts
1. Import the repository and add the 3 variables.
2. Create the tables ONE time from your computer: put the same DATABASE_URL in a file named .env, then run
   npm install
   npm run deploy:setup

## Any server or VPS (Hostinger VPS, GoDaddy VPS, DigitalOcean, AWS, your own computer) with Docker
1. Install Docker on the server and copy the repository there (git clone).
2. Create a file named .env with SESSION_SECRET=... and ADMIN_EMAIL=...
3. Run:  docker compose up -d --build
   The website runs on port 3000 together with its own PostgreSQL database. Put a domain in front of it with Caddy or Nginx.

## Hostinger / GoDaddy Node.js hosting (no Docker)
Use a plan that offers Node.js apps (for example Hostinger "Node.js Web Apps Hosting" or a VPS). Ordinary shared hosting cannot run this website.
1. Connect the GitHub repository.
2. Build command: npm install && npm run build      Start command: npm run start
3. Add the 3 variables, then run once (in the host's terminal or from your computer): npm run deploy:setup

## If the build fails
This code was written by AI. The build ignores small type warnings so the site can start, but read QA_REPORT.md before real use.
`;

  return [
    { path: "Dockerfile", content: dockerfile },
    { path: ".dockerignore", content: dockerignore },
    { path: "docker-compose.yml", content: compose },
    { path: "render.yaml", content: render },
    { path: "Procfile", content: procfile },
    { path: "DEPLOY.md", content: guide },
  ];
}
