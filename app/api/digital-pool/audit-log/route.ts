import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDigitalPoolApiContext } from "@/lib/user-api-auth";

const LIMIT = 100;

/** Member-only: recent Digital Pool activity for the logged-in pool session (no `/api/user/*` changes). */
export async function GET(req: Request) {
  try {
    const ctx = await getDigitalPoolApiContext(req);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, status: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const rows = await db.digitalPoolAuditLog.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { id: true, action: true, createdAt: true },
    });

    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("digital-pool/audit-log:", e);
    return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
  }
}
