import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * Prisma schema includes actor columns on Withdrawal; unmigrated DBs throw P2022.
 * Add missing columns once and retry.
 */
export async function ensureWithdrawalActorColumns(db: PrismaClient): Promise<void> {
  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT`,
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Withdrawal_approvedByUserId_idx" ON "Withdrawal"("approvedByUserId")`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "rejectedByUserId" TEXT`,
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Withdrawal_rejectedByUserId_idx" ON "Withdrawal"("rejectedByUserId")`,
    );
  } catch (e) {
    console.error("ensureWithdrawalActorColumns", e);
  }
}

/** @deprecated use ensureWithdrawalActorColumns */
export const ensureWithdrawalApprovedByColumn = ensureWithdrawalActorColumns;

export async function withWithdrawalColumnRetry<T>(
  db: PrismaClient,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const meta = (e as Prisma.PrismaClientKnownRequestError).meta as { column?: string } | undefined;
    const col = String(meta?.column ?? "");
    const needsActorCol =
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2022" &&
      (col.includes("approvedByUserId") ||
        col.includes("rejectedByUserId") ||
        msg.includes("approvedByUserId") ||
        msg.includes("rejectedByUserId"));
    if (needsActorCol) {
      await ensureWithdrawalActorColumns(db);
      return await run();
    }
    throw e;
  }
}
