import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

/** Gross USDT approved from the Digital Pool wallet (matches `user-dashboard-data`). */
export async function sumApprovedDigitalPoolWithdrawalsGross(db: PrismaClient, userId: string): Promise<number> {
  try {
    const rows = await db.$queryRaw<Array<{ v: unknown }>>(
      Prisma.sql`
        SELECT COALESCE(SUM(COALESCE("grossRequested", amount)), 0) AS v
        FROM "Withdrawal"
        WHERE "userId" = ${userId} AND status = 'approved' AND "digitalPoolSource" = true
      `,
    );
    return Number(rows[0]?.v ?? 0);
  } catch {
    try {
      const agg = await db.withdrawal.aggregate({
        where: { userId, status: "approved", digitalPoolSource: true },
        _sum: { amount: true },
      });
      return Number(agg._sum.amount ?? 0);
    } catch {
      return 0;
    }
  }
}

/**
 * "Total income" in the Digital Pool panel: sum of seat rewards when `DigitalPoolSeatReward` rows exist
 * (matches withdraw-wallet reconcile); otherwise the sum of positive pool `adjustment` transactions.
 */
export async function getDigitalPoolTotalIncomeUsd(
  db: PrismaClient,
  userId: string,
  fallbackTransactionSum: number,
): Promise<number> {
  const api = db as unknown as { digitalPoolSeatReward?: { count: (a: unknown) => Promise<number> } };
  if (typeof api.digitalPoolSeatReward?.count !== "function") {
    return fallbackTransactionSum;
  }
  try {
    const n = await db.digitalPoolSeatReward.count({ where: { ownerUserId: userId } });
    if (n === 0) return fallbackTransactionSum;
    const agg = await db.digitalPoolSeatReward.aggregate({
      where: { ownerUserId: userId },
      _sum: { amount: true },
    });
    return Number(agg._sum?.amount ?? 0);
  } catch {
    return fallbackTransactionSum;
  }
}

/**
 * Aligns `User.digitalPoolWithdrawBalance` with the sum of `DigitalPoolSeatReward` for this user
 * minus approved Digital Pool withdrawals. Fixes overstated balances from older grant paths.
 *
 * If there are no seat-reward rows, the stored balance is left unchanged (pre–seat-reward legacy).
 */
export async function reconcileDigitalPoolWithdrawBalanceFromSeatRewards(
  db: PrismaClient,
  userId: string,
): Promise<number> {
  const seatApi = db as unknown as { digitalPoolSeatReward?: { aggregate: (a: unknown) => Promise<unknown> } };
  if (typeof seatApi.digitalPoolSeatReward?.aggregate !== "function") {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { digitalPoolWithdrawBalance: true },
    });
    return Number(u?.digitalPoolWithdrawBalance ?? 0);
  }

  let seatSum: { _sum: { amount: unknown } | null };
  let seatCount: number;
  try {
    seatSum = (await db.digitalPoolSeatReward.aggregate({
      where: { ownerUserId: userId },
      _sum: { amount: true },
    })) as { _sum: { amount: unknown } | null };
    seatCount = await db.digitalPoolSeatReward.count({ where: { ownerUserId: userId } });
  } catch {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { digitalPoolWithdrawBalance: true },
    });
    return Number(u?.digitalPoolWithdrawBalance ?? 0);
  }

  if (seatCount === 0) {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { digitalPoolWithdrawBalance: true },
    });
    return Number(u?.digitalPoolWithdrawBalance ?? 0);
  }

  const seatTotal = Number(seatSum._sum?.amount ?? 0);
  const withdrawn = await sumApprovedDigitalPoolWithdrawalsGross(db, userId);
  const expected = Math.max(0, Number((seatTotal - withdrawn).toFixed(2)));

  const u2 = await db.user.findUnique({
    where: { id: userId },
    select: { digitalPoolWithdrawBalance: true },
  });
  const stored = Number(u2?.digitalPoolWithdrawBalance ?? 0);

  if (Math.abs(stored - expected) < 0.01) {
    return expected;
  }

  await db.user.update({
    where: { id: userId },
    data: { digitalPoolWithdrawBalance: new Prisma.Decimal(expected.toFixed(2)) },
  });

  return expected;
}
