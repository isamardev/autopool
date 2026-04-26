import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { computeBinaryLevelsCompleted } from "@/lib/binary-level-completed";
import { TREE_QUERY_MAX_DEPTH } from "@/lib/tree-display";

async function getEstimatedUserPanelLevel1CompletedAt(
  db: PrismaClient,
  userId: string,
): Promise<Date | null> {
  const rows = await db.$queryRaw<Array<{ createdAt: Date }>>(Prisma.sql`
    SELECT "createdAt"
    FROM "User"
    WHERE "referredById" = ${userId} AND status <> 'inactive'
    ORDER BY "createdAt" ASC, id ASC
    OFFSET 1
    LIMIT 1
  `);
  return rows[0]?.createdAt ?? null;
}

/**
 * Persist the first main-panel L1 completion timestamp once.
 * For existing data we use the 2nd active direct referral's `createdAt`, which is when binary L1 became true.
 */
export async function markUserPanelLevel1CompletedAtIfNeeded(
  db: PrismaClient,
  userId: string,
  completedAt?: Date | null,
): Promise<void> {
  const at = completedAt ?? (await getEstimatedUserPanelLevel1CompletedAt(db, userId));
  if (!at) return;

  try {
    await db.$executeRaw(Prisma.sql`
      UPDATE "User"
      SET "userPanelLevel1CompletedAt" = ${at}
      WHERE id = ${userId}
        AND "userPanelLevel1CompletedAt" IS NULL
    `);
  } catch (e) {
    // Allows older DBs to keep running until the migration is deployed.
    console.error("markUserPanelLevel1CompletedAtIfNeeded:", e);
  }
}

/** Same depth query as `/api/user/dashboard` — “Level Completed” / L1 unlock. */
export async function getBinaryLevelsCompletedForUser(db: PrismaClient, userId: string): Promise<number> {
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
  const levelCounts: Record<string, number> = {};
  for (const r of rows) {
    levelCounts[String(r.level)] = Number(r.count);
  }
  const completed = computeBinaryLevelsCompleted(levelCounts);
  if (completed >= 1) {
    await markUserPanelLevel1CompletedAtIfNeeded(db, userId);
  }
  return completed;
}
