import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { DIGITAL_POOL_COOKIE, verifyDigitalPoolSession } from "@/lib/digital-pool-session";

const LIMIT = 100;

/** Member-only: recent Digital Pool activity for the logged-in pool session (no `/api/user/*` changes). */
export async function GET() {
  try {
    const jar = await cookies();
    const session = verifyDigitalPoolSession(jar.get(DIGITAL_POOL_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, status: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.status === "inactive") {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }
    if (user.status === "blocked") {
      return NextResponse.json({ error: "Account blocked" }, { status: 403 });
    }

    const rows = await db.digitalPoolAuditLog.findMany({
      where: { userId: session.userId },
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
