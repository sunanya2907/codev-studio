// Switches which database the app uses: node scripts/use-db.mjs mysql|postgres
// It copies prisma/schemas/<name>.prisma over prisma/schema.prisma and regenerates the client.
import { copyFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const name = (process.argv[2] || "").toLowerCase();
const from = `prisma/schemas/${name}.prisma`;
if (!["mysql", "postgres"].includes(name) || !existsSync(from)) {
  console.error("Usage: node scripts/use-db.mjs mysql|postgres");
  process.exit(1);
}
copyFileSync(from, "prisma/schema.prisma");
console.log(`prisma/schema.prisma is now the ${name} schema.`);
console.log("Make sure DATABASE_URL in .env matches (see .env.example), then run: npx prisma db push");
execSync("npx prisma generate", { stdio: "inherit" });
