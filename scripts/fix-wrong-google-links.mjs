// Finds Google logins that were attached to the WRONG user and (optionally) removes them.
//
//   node scripts/fix-wrong-google-links.mjs           -> only shows what it would remove (safe)
//   node scripts/fix-wrong-google-links.mjs --apply   -> removes the wrong links
//
// Why: if somebody was logged in as A and then signed in with the Google account of B, the old
// code attached B's Google login to A. B then always opened A. Each Google login stores the
// email Google gave; a link is WRONG when that email is not the email of the user it belongs to.
// Nothing else is touched. B simply gets a fresh account the next time B signs in.
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();

const emailOf = (idToken) => {
  try {
    const p = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof p.email === "string" ? p.email.toLowerCase() : null;
  } catch {
    return null;
  }
};

const accounts = await db.account.findMany({
  where: { provider: "google" },
  include: { user: { select: { id: true, email: true, name: true } } },
});

let wrong = 0;
for (const a of accounts) {
  const googleEmail = a.id_token ? emailOf(a.id_token) : null;
  const owner = a.user.email.toLowerCase();
  if (!googleEmail) {
    console.log(`? cannot tell (no id_token)  google id ${a.providerAccountId}  -> user ${owner}`);
    continue;
  }
  if (googleEmail === owner) {
    console.log(`OK    ${googleEmail}  -> user ${owner}`);
    continue;
  }
  wrong++;
  console.log(`WRONG ${googleEmail}  is attached to user ${owner}  (google id ${a.providerAccountId})`);
  if (apply) {
    await db.account.delete({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: a.providerAccountId } },
    });
    console.log("      removed.");
  }
}

console.log(
  wrong === 0
    ? "\nNo wrong links found."
    : apply
    ? `\nRemoved ${wrong} wrong link(s). Those people can now sign in with their own Google account.`
    : `\n${wrong} wrong link(s) found. Run again with --apply to remove them.`
);
await db.$disconnect();
