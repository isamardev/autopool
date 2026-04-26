import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserApiContext } from "@/lib/user-api-auth";

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const { username } = await req.json();

    if (!username || username.trim().length < 2) {
      return NextResponse.json({ error: "Username must be at least 2 characters" }, { status: 400 });
    }

    const db = getDb();
    const user = await db.user.update({
      where: { id: ctx.userId },
      data: { username: username.trim() }
    });

    return NextResponse.json({ success: true, user: { username: user.username } });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
