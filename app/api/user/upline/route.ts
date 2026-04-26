import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserApiContext } from "@/lib/user-api-auth";

export async function GET(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.effectiveStatus === "inactive") {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }
    if (ctx.effectiveStatus === "blocked") {
      return NextResponse.json({ error: "Account blocked" }, { status: 403 });
    }

    const db = getDb();
    const userId = ctx.userId;

    const me = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, walletAddress: true, referrerCode: true, referredById: true, status: true },
    });

    if (!me) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!me.referredById) {
      return NextResponse.json({ nodes: [] });
    }

    const parent = await db.user.findUnique({
      where: { id: me.referredById },
      select: { 
        id: true, 
        username: true, 
        email: true, 
        referrerCode: true,
      },
    });

    if (!parent) {
      return NextResponse.json({ nodes: [] });
    }

    return NextResponse.json({ 
      nodes: [
        parent,
        { id: me.id, username: me.username, email: me.email, referrerCode: me.referrerCode }
      ],
      upline: parent 
    });
  } catch (error) {
    console.error("Failed to fetch upline:", error);
    return NextResponse.json({ error: "Failed to fetch upline" }, { status: 500 });
  }
}
