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

    const me = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, walletAddress: true, referrerCode: true, referredById: true, status: true },
    });
    if (!me) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const descendants = await db.$queryRaw<
      Array<{
        id: string;
        username: string;
        email: string;
        walletAddress: string;
        referrerCode: string;
        referredById: string | null;
        createdAt: Date;
        depth: number;
        verified: number;
      }>
    >(Prisma.sql`
      WITH RECURSIVE team AS (
        SELECT id, username, email, "walletAddress", "referrerCode", "referredById", "createdAt", 0 AS depth
        FROM "User"
        WHERE id = ${userId}
        UNION ALL
        SELECT u.id, u.username, u.email, u."walletAddress", u."referrerCode", u."referredById", u."createdAt", t.depth + 1 AS depth
        FROM "User" u
        JOIN team t ON u."referredById" = t.id
        WHERE t.depth < ${TREE_QUERY_MAX_DEPTH}
      ),
      first_deposits AS (
        SELECT "userId", MIN("createdAt") AS "firstDepositAt"
        FROM "Deposit"
        WHERE status = 'confirmed'
        GROUP BY "userId"
      ),
      first_activations AS (
        SELECT "userId", MIN("createdAt") AS "firstActivationAt"
        FROM "Transaction"
        WHERE type = 'activation'
        GROUP BY "userId"
      )
      SELECT
        t.id, t.username, t.email, t."walletAddress", t."referrerCode", t."referredById", t."createdAt", t.depth,
        CASE
          WHEN (
            fd."firstDepositAt" IS NOT NULL
            AND fd."firstDepositAt" <= t."createdAt" + interval '24 hours'
          ) OR (
            fa."firstActivationAt" IS NOT NULL
            AND fa."firstActivationAt" <= t."createdAt" + interval '24 hours'
          ) THEN 1
          ELSE 0
        END AS verified
      FROM team t
      LEFT JOIN first_deposits fd ON fd."userId" = t.id
      LEFT JOIN first_activations fa ON fa."userId" = t.id
      ORDER BY t.depth ASC
    `);

    const nodes = descendants.map((n) => ({
      ...n,
      depth: Number(n.depth),
      verified: Number(n.verified) === 1,
    }));

    return NextResponse.json({ nodes });
  } catch (error) {
    console.error("Failed to fetch team:", error);
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }
}
