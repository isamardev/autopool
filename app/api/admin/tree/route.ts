import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdminSection } from "@/lib/admin-api-guard";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TREE_QUERY_MAX_DEPTH } from "@/lib/tree-display";
import {
  COMPANY_REF_CODE,
  findCompanyRootUser,
  getConfiguredAdminEmail,
} from "@/lib/company-admin";

export async function GET() {
  try {
    const gate = await requireAdminSection("overview");
    if (!gate.ok) return gate.response;

    const db = getDb();
    let root = await findCompanyRootUser(db);
    if (!root) {
      const rootEmail = getConfiguredAdminEmail();
      const passwordHash = await bcrypt.hash("admin123", 12);
      const walletPlaceholder = `placeholder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const created = await db.user.create({
        data: {
          username: "Admin",
          country: "Pakistan",
          email: rootEmail,
          passwordHash,
          walletAddress: walletPlaceholder,
          referrerCode: COMPANY_REF_CODE,
          referredById: null,
          balance: 0,
          status: "admin",
        },
        select: { id: true, status: true },
      });
      root = created;
    }

    const rows = await db.$queryRaw<
      Array<{
        id: string;
        username: string;
        email: string;
        walletAddress: string;
        referrerCode: string;
        referredById: string | null;
        depth: number;
      }>
    >(Prisma.sql`
      WITH RECURSIVE team AS (
        SELECT id, username, email, "walletAddress", "referrerCode", "referredById", 0 AS depth
        FROM "User"
        WHERE id = ${root.id}
        UNION ALL
        SELECT u.id, u.username, u.email, u."walletAddress", u."referrerCode", u."referredById", t.depth + 1 AS depth
        FROM "User" u
        JOIN team t ON u."referredById" = t.id
        WHERE t.depth < ${TREE_QUERY_MAX_DEPTH}
      )
      SELECT * FROM team ORDER BY depth ASC
    `);

    const nodes = rows.map((r) => ({
      ...r,
      depth: Number(r.depth),
    }));

    return NextResponse.json({ nodes });
  } catch {
    return NextResponse.json({ error: "Failed to fetch admin tree" }, { status: 500 });
  }
}
