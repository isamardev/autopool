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

    const url = new URL(req.url);
    const take = Math.min(100, Math.max(1, Number(url.searchParams.get("take") ?? 50)));

    const db = getDb();
    const [items, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: "desc" },
        take,
      }),
      db.notification.count({
        where: { userId: ctx.userId, readAt: null },
      }),
    ]);

    return NextResponse.json({ unread, items });
  } catch {
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
