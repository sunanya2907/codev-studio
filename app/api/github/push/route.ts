import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBillingState } from "@/lib/tokens";
import { logActivity } from "@/lib/activity";
import { cleanPath } from "@/lib/files";
import { STANDARD_PRICE_LABEL } from "@/lib/plans";

// Pushes the generated project to a NEW repository in the person's own GitHub account.
// The GitHub token is used for this one request only: it is never saved or logged.
// From GitHub the person can deploy anywhere (Vercel, Render, Railway, a VPS, Hostinger Node.js ...).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_FILES = 400;
const MAX_TOTAL = 3_500_000; // characters (Vercel rejects request bodies above ~4.5 MB)

type GhResult<T = any> = { ok: boolean; status: number; data: T };

async function gh<T = any>(token: string, path: string, method = "GET", body?: unknown): Promise<GhResult<T>> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Build_Core",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

    const user = await getBillingState(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (user.tier === "FREE") {
      return NextResponse.json(
        { error: `Pushing to GitHub is part of the paid plans. Upgrade to Standard (${STANDARD_PRICE_LABEL}) to export your code.`, code: "PLAN_LOCKED" },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request (the project may be too large)." }, { status: 400 });
    }
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const repoName = typeof body.repoName === "string" ? body.repoName.trim() : "";
    const isPrivate = body.isPrivate !== false;
    if (!token || token.length < 20) return NextResponse.json({ error: "Paste your GitHub token first." }, { status: 400 });
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repoName) || repoName === "." || repoName === "..") {
      return NextResponse.json({ error: "Repository name: use letters, numbers, dots, dashes or underscores (no spaces)." }, { status: 400 });
    }

    // Files: clean every path, drop duplicates, limit size.
    const seen = new Map<string, string>();
    let total = 0;
    for (const f of Array.isArray(body.files) ? (body.files as { path?: unknown; content?: unknown }[]) : []) {
      if (typeof f?.path !== "string" || typeof f?.content !== "string") continue;
      const path = cleanPath(f.path);
      if (!path) continue;
      const base = path.split("/").pop() || "";
      const secretEnv = /^\.env/.test(base) && base !== ".env.example"; // never push real secrets
      if (secretEnv || /(^|\/)(node_modules|\.next|\.git)(\/|$)/.test(path)) continue;
      total += f.content.length;
      if (total > MAX_TOTAL) return NextResponse.json({ error: "The project is too large to push in one go." }, { status: 413 });
      seen.set(path, f.content);
    }
    if (seen.size === 0) return NextResponse.json({ error: "There are no files to push yet. Build a website first." }, { status: 400 });
    if (seen.size > MAX_FILES) return NextResponse.json({ error: "Too many files." }, { status: 413 });

    // 1) who is this token?
    const me = await gh<{ login?: string; message?: string }>(token, "/user");
    if (!me.ok || !me.data.login) {
      return NextResponse.json(
        { error: me.status === 401 ? "GitHub says this token is not valid (or it expired). Create a new one and try again." : `GitHub error: ${me.data.message || me.status}` },
        { status: 400 }
      );
    }
    const owner = me.data.login;

    // 2) create the repository (never overwrite an existing one)
    const created = await gh<{ html_url?: string; default_branch?: string; message?: string; errors?: { message?: string }[] }>(token, "/user/repos", "POST", {
      name: repoName,
      private: isPrivate,
      description: "Generated with Build_Core",
      auto_init: true, // creates the first commit, which the Git Data API below needs
    });
    if (!created.ok) {
      const why = created.data.errors?.[0]?.message || created.data.message || String(created.status);
      const msg = /already exists/i.test(why)
        ? `You already have a repository named "${repoName}". Pick another name.`
        : created.status === 403 || created.status === 404
          ? "This token is not allowed to create repositories. Create a classic token with the \"repo\" permission ticked."
          : `GitHub could not create the repository: ${why}`;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const branch = created.data.default_branch || "main";
    const repoUrl = created.data.html_url || `https://github.com/${owner}/${repoName}`;

    // 3) one commit with every file (file contents go inline in the tree)
    const ref = await gh<{ object?: { sha?: string } }>(token, `/repos/${owner}/${repoName}/git/ref/heads/${branch}`);
    const parent = ref.data.object?.sha;
    if (!ref.ok || !parent) {
      // GitHub needs a moment after auto_init on some accounts
      await new Promise((r) => setTimeout(r, 1500));
    }
    const ref2 = parent ? ref : await gh<{ object?: { sha?: string } }>(token, `/repos/${owner}/${repoName}/git/ref/heads/${branch}`);
    const parentSha = ref2.data.object?.sha;
    if (!parentSha) return NextResponse.json({ error: `The repository was created (${repoUrl}) but its first commit was not ready. Push again with another name.` }, { status: 502 });

    const tree = await gh<{ sha?: string; message?: string }>(token, `/repos/${owner}/${repoName}/git/trees`, "POST", {
      base_tree: parentSha,
      tree: [...seen.entries()].map(([path, content]) => ({ path, mode: "100644", type: "blob", content })),
    });
    if (!tree.ok || !tree.data.sha) return NextResponse.json({ error: `The repository was created (${repoUrl}) but the files could not be added: ${tree.data.message || tree.status}` }, { status: 502 });

    const commit = await gh<{ sha?: string; message?: string }>(token, `/repos/${owner}/${repoName}/git/commits`, "POST", {
      message: "Generated by Build_Core",
      tree: tree.data.sha,
      parents: [parentSha],
    });
    if (!commit.ok || !commit.data.sha) return NextResponse.json({ error: `The repository was created (${repoUrl}) but the commit failed: ${commit.data.message || commit.status}` }, { status: 502 });

    const moved = await gh(token, `/repos/${owner}/${repoName}/git/refs/heads/${branch}`, "PATCH", { sha: commit.data.sha, force: false });
    if (!moved.ok) return NextResponse.json({ error: `The repository was created (${repoUrl}) but the files could not be published: ${moved.data.message || moved.status}` }, { status: 502 });

    await logActivity(session.user.id, "GITHUB_PUSH", `GitHub push: ${owner}/${repoName} (${seen.size} files)`, 0);
    return NextResponse.json({ url: repoUrl, owner, repo: repoName, files: seen.size, isPrivate });
  } catch (e) {
    console.error("GITHUB PUSH ERROR:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The push failed. Please try again." }, { status: 500 });
  }
}