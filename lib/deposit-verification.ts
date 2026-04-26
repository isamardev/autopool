import { Prisma } from "@prisma/client";
import { createPublicClient, decodeEventLog, formatUnits, http, parseAbiItem } from "viem";
import { bsc } from "viem/chains";
import { getDb } from "@/lib/db";
import { INTERACTIVE_TX_OPTIONS, runFixedPayoutEngineWithTx } from "@/lib/mlm-logic";
import { isActivatedMemberStatus } from "@/lib/user-status";
import { getNormalizedReceiverWalletAddress } from "@/lib/receiver-wallet";
import { USDT_BEP20_ADDRESS } from "@/lib/web3Actions";
import { MIN_DEPOSIT_USDT } from "@/lib/wallet-limits";
/** Max age of the on-chain transaction (from block time) for accepting a deposit TX ID. */
const DEPOSIT_TX_MAX_AGE_SEC = 24 * 60 * 60;

export const INVALID_DEPOSIT_TX_MESSAGE = "Please enter valid TX ID.";
/** Shown when the transfer is older than {@link DEPOSIT_TX_MAX_AGE_SEC} when the user submits the hash. */
export const DEPOSIT_TX_EXPIRED_MESSAGE = "Your transaction has expired.";

/** Shown when BSC RPC has no receipt (wrong chain, wrong hash, or not confirmed yet). */
export const TX_NOT_FOUND_ON_BSC_MESSAGE = "Transaction not found";

/** Accept `0xabc...` or paste without `0x` (64 hex). */
export function normalizeTransactionHashInput(raw: string): string {
  const t = String(raw)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .trim();
  const noSpace = t.replace(/\s+/g, "");
  if (/^0x[a-fA-F0-9]{64}$/.test(noSpace)) return noSpace.toLowerCase();
  if (/^[a-fA-F0-9]{64}$/.test(noSpace)) return `0x${noSpace.toLowerCase()}`;
  return noSpace;
}

type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["$transaction"]>[0]>[0];

export class DepositVerificationError extends Error {
  constructor(
    public readonly code: "INVALID_TX" | "DUPLICATE_TX" | "RECEIVER_NOT_CONFIGURED" | "TX_EXPIRED",
    message: string,
  ) {
    super(message);
  }
}

type BlockTimestampClient = {
  getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint }>;
};

export async function assertBscDepositBlockNotExpired(client: BlockTimestampClient, blockNumber: bigint) {
  const block = await client.getBlock({ blockNumber });
  const txSec = Number(block.timestamp);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(txSec)) {
    throw new DepositVerificationError("INVALID_TX", INVALID_DEPOSIT_TX_MESSAGE);
  }
  if (nowSec - txSec > DEPOSIT_TX_MAX_AGE_SEC) {
    throw new DepositVerificationError("TX_EXPIRED", DEPOSIT_TX_EXPIRED_MESSAGE);
  }
}

async function ensureUsdtBalanceColumn(tx: DbTx) {
  try {
    await tx.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "usdtBalance" DECIMAL(18,2) DEFAULT 0`);
  } catch {
    /* ignore */
  }
}

export async function verifyUsdtDepositTransaction(transactionHash: string) {
  const txHash = normalizeTransactionHashInput(transactionHash);
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new DepositVerificationError("INVALID_TX", INVALID_DEPOSIT_TX_MESSAGE);
  }

  const receiverWalletAddress = await getNormalizedReceiverWalletAddress();
  if (!/^0x[a-fA-F0-9]{40}$/.test(receiverWalletAddress)) {
    throw new DepositVerificationError("RECEIVER_NOT_CONFIGURED", "Receiver wallet not configured");
  }

  const rpcUrl = process.env.BSC_RPC_URL?.trim();
  const client = createPublicClient({
    chain: bsc,
    transport: http(
      rpcUrl ||
        "https://bsc-dataseed1.binance.org",
    ),
  });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch (e: unknown) {
    const name =
      e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
    if (name === "TransactionReceiptNotFoundError") {
      throw new DepositVerificationError("INVALID_TX", TX_NOT_FOUND_ON_BSC_MESSAGE);
    }
    throw new DepositVerificationError("INVALID_TX", INVALID_DEPOSIT_TX_MESSAGE);
  }

  if (!receipt || receipt.status !== "success") {
    throw new DepositVerificationError(
      "INVALID_TX",
      !receipt ? TX_NOT_FOUND_ON_BSC_MESSAGE : INVALID_DEPOSIT_TX_MESSAGE,
    );
  }

  await assertBscDepositBlockNotExpired(client, receipt.blockNumber);

  /** Do not require `receipt.to === USDT`: routers/DEX aggregate USDT transfers in an outer contract call. */

  const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
  let matchedLog:
    | {
        from: `0x${string}`;
        to: `0x${string}`;
        value: bigint;
      }
    | null = null;

  for (const log of receipt.logs) {
    if ((log.address || "").toLowerCase() !== USDT_BEP20_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Transfer") continue;
      const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
      if ((args.to || "").toLowerCase() === receiverWalletAddress) {
        matchedLog = args;
        break;
      }
    } catch {
      /* skip undecodable logs */
    }
  }

  if (!matchedLog) {
    throw new DepositVerificationError("INVALID_TX", INVALID_DEPOSIT_TX_MESSAGE);
  }

  let decimals = 18;
  try {
    const d = await client.readContract({
      address: USDT_BEP20_ADDRESS as `0x${string}`,
      abi: [
        {
          type: "function",
          name: "decimals",
          stateMutability: "view",
          inputs: [],
          outputs: [{ name: "decimals", type: "uint8" }],
        },
      ],
      functionName: "decimals",
    });
    decimals = Number(d || 18);
  } catch {
    /* keep default */
  }

  const amountRaw = Number(formatUnits(matchedLog.value, decimals));
  const amount = Number(amountRaw.toFixed(2));
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_USDT) {
    throw new DepositVerificationError("INVALID_TX", INVALID_DEPOSIT_TX_MESSAGE);
  }

  return {
    txHash,
    amount,
    senderAddress: (matchedLog.from || "").toLowerCase(),
    receiverWalletAddress,
  };
}

export async function finalizeVerifiedDeposit(params: {
  userId: string;
  txHash: string;
  amount: number;
  note?: string;
}) {
  const db = getDb();
  const txHash = params.txHash.trim();
  const amount = Number(params.amount.toFixed(2));

  return db.$transaction(
    async (tx) => {
      const existing = await tx.deposit.findUnique({ where: { txHash } });
      if (existing?.status === "confirmed" || (existing && existing.userId !== params.userId)) {
        throw new DepositVerificationError("DUPLICATE_TX", INVALID_DEPOSIT_TX_MESSAGE);
      }

      await ensureUsdtBalanceColumn(tx);

      try {
        await tx.user.update({
          where: { id: params.userId },
          data: { usdtBalance: { increment: new Prisma.Decimal(amount.toFixed(2)) } } as any,
        });
      } catch {
        await tx.$executeRawUnsafe(
          `UPDATE "User" SET "usdtBalance" = COALESCE("usdtBalance", 0) + $1 WHERE id = $2`,
          amount,
          params.userId,
        );
      }

      const deposit = existing
        ? await tx.deposit.update({
            where: { id: existing.id },
            data: {
              userId: params.userId,
              chain: "BSC",
              amount: new Prisma.Decimal(amount.toFixed(2)),
              status: "confirmed",
              verifiedAt: new Date(),
            },
          })
        : await tx.deposit.create({
            data: {
              userId: params.userId,
              chain: "BSC",
              txHash,
              amount: new Prisma.Decimal(amount.toFixed(2)),
              status: "confirmed",
              verifiedAt: new Date(),
            },
          });

      const member = await tx.user.findUnique({
        where: { id: params.userId },
        select: { status: true },
      });
      /** Inactive / pre-activation: credit USDT only — uplines get the fixed ladder once on activation, not twice. */
      const distributeMlm = isActivatedMemberStatus(member?.status);

      const payout = await runFixedPayoutEngineWithTx(tx, {
        sourceUserId: params.userId,
        depositAmount: amount,
        note: params.note ?? `Deposit hash ${txHash}`,
        distributeMlm,
      });

      return { deposit, payout };
    },
    INTERACTIVE_TX_OPTIONS,
  );
}
