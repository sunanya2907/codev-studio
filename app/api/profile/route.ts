import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const NAME_MAX = 60;

const publicUser = {
  id: true,
  name: true,
  email: true,
  image: true,
  tier: true,
  tokenBalance: true,
  createdAt: true,
} as const;

// GET: the signed-in person's profile, straight from the database.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: publicUser });
  if (!user) return NextResponse.json({ error: "Account not found. Please sign in again." }, { status: 404 });
  return NextResponse.json({ user });
}

// PATCH: change display name and / or profile photo. The email can not be changed here.
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: { name?: unknown; image?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const data: { name?: string; image?: string | null } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") return NextResponse.json({ error: "Invalid name." }, { status: 400 });
    // collapse spaces, drop control characters and angle brackets
    const name = body.name.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
    if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
    if (name.length > NAME_MAX) {
      return NextResponse.json({ error: `Name can be at most ${NAME_MAX} characters.` }, { status: 400 });
    }
    data.name = name;
  }

  if (body.image !== undefined) {
    if (body.image === null || body.image === "") {
      data.image = null; // remove the photo => initials are shown
    } else if (typeof body.image === "string") {
      const url = body.image.trim();
      let ok = false;
      try {
        const u = new URL(url);
        ok = u.protocol === "https:" && url.length <= 500;
      } catch {}
      if (!ok) {
        return NextResponse.json({ error: "Photo must be a secure https:// link (max 500 characters)." }, { status: 400 });
      }
      data.image = url;
    } else {
      return NextResponse.json({ error: "Invalid photo." }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const user = await db.user.update({ where: { id: session.user.id }, data, select: publicUser });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Could not save your profile. Please try again." }, { status: 500 });
  }
}
