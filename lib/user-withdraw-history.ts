import type { PrismaClient, Transaction, Withdrawal } from "@prisma/client";
import { INTERNAL_TRANSFER_WITHDRAW_TO_USDT_NOTE } from "@/lib/internal-transfer-constants";

export type WithdrawHistoryListItem = {
  id: string;
  address: string;
  amount: number;
  grossRequested: number | null;
  feeAmount: number | null;
  status: string;
  txHash: string | null;
  createdAt: string;
  /** On-chain withdrawal request vs internal move to USDT balance */
  entryKind: "chain" | "internal_usdt";
};

function mapWithdrawal(w: Withdrawal): WithdrawHistoryListItem {
  return {
    id: w.id,
    address: w.address,
    amount: Number(w.amount),
    grossRequested: w.grossRequested != null ? Number(w.grossRequested) : null,
    feeAmount: w.feeAmount != null ? Number(w.feeAmount) : null,
    status: w.status,
    txHash: w.txHash,
    createdAt: w.createdAt.toISOString(),
    entryKind: "chain",
  };
}

function mapInternalToUsdt(t: Transaction): WithdrawHistoryListItem {
  const amt = Number(t.amount);
  return {
    id: `internal-${t.id}`,
    address: "USDT wallet (same account)",
    amount: amt,
    grossRequested: amt,
    feeAmount: null,
    status: "approved",
    txHash: null,
    createdAt: t.createdAt.toISOString(),
    entryKind: "internal_usdt",
  };
}

/** All-time sum of withdraw → USDT internal moves (counts toward “total withdraw” on dashboard). */
export async function sumWithdrawToUsdtInternal(db: PrismaClient, userId: string): Promise<number> {
  const agg = await db.transaction.aggregate({
    where: {
      userId,
      type: "adjustment",
      note: INTERNAL_TRANSFER_WITHDRAW_TO_USDT_NOTE,
    },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

export async function findWithdrawToUsdtTransactions(db: PrismaClient, userId: string, take: number) {
  return db.transaction.findMany({
    where: {
      userId,
      type: "adjustment",
      note: INTERNAL_TRANSFER_WITHDRAW_TO_USDT_NOTE,
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Merge on-chain withdrawals and internal withdraw→USDT rows, newest first. */
export function mergeWithdrawHistoryLists(
  withdrawals: Withdrawal[],
  internals: Transaction[],
  limit: number,
): WithdrawHistoryListItem[] {
  const rows = [
    ...withdrawals.map(mapWithdrawal),
    ...internals.map(mapInternalToUsdt),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return rows.slice(0, limit);
}
