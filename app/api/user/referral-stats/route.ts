import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getUserApiContext } from "@/lib/user-api-auth";
import { TREE_QUERY_MAX_DEPTH } from "@/lib/tree-display";

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

    const rows = await db.$queryRaw<Array<{ level: number; count: bigint | number }>>(Prisma.sql`
      WITH RECURSIVE downline AS (
        SELECT id, "referredById", 1 AS depth
        FROM "User"
        WHERE "referredById" = ${userId} AND status <> 'inactive'
        UNION ALL
        SELECT u.id, u."referredById", d.depth + 1
        FROM "User" u
        JOIN downline d ON u."referredById" = d.id
        WHERE d.depth < ${TREE_QUERY_MAX_DEPTH} AND u.status <> 'inactive'
      )
      SELECT depth AS level, COUNT(*) AS count
      FROM downline
      GROUP BY depth
      ORDER BY depth ASC
    `);

    const levels: Record<string, number> = {};
    for (const r of rows) {
      levels[String(r.level)] = Number(r.count);
    }

    let total = 0;
    for (const v of Object.values(levels)) total += v;

    return NextResponse.json({ total, levels });
  } catch {
    return NextResponse.json({ error: "Failed to fetch referral stats" }, { status: 500 });
  }
}
