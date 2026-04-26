import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, decodeEventLog } from "viem";
import { bsc } from "viem/chains";
import { USDT_BEP20_ADDRESS } from "@/lib/web3Actions";
import { getDb } from "@/lib/db";
import { getNormalizedReceiverWalletAddress } from "@/lib/receiver-wallet";
import { formatUnits } from "viem";
import {
  assertBscDepositBlockNotExpired,
  DepositVerificationError,
  finalizeVerifiedDeposit,
} from "@/lib/deposit-verification";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userIdFilter = url.searchParams.get("userId") || "";
    const lookbackBlocks = Number(url.searchParams.get("lookback") || 500);

    const receiverWalletAddress = await getNormalizedReceiverWalletAddress();
    if (!receiverWalletAddress || !/^0x[a-fA-F0-9]{40}$/.test(receiverWalletAddress)) {
      return NextResponse.json({ error: "Receiver wallet not configured" }, { status: 500 });
    }

    const client = createPublicClient({ chain: bsc, transport: http() });
    const latest = await client.getBlockNumber();
    const fromBlock = latest > BigInt(lookbackBlocks) ? latest - BigInt(lookbackBlocks) : BigInt(0);
    const toBlock = latest;

    const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

    const logs = await client.getLogs({
      address: USDT_BEP20_ADDRESS,
      fromBlock,
      toBlock,
      event: transferEvent,
      args: { to: receiverWalletAddress as `0x${string}` },
    } as any);

    const db = getDb();
    let createdCount = 0;
    let createdForUser = 0;

    // get decimals once
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
    } catch {}

    for (const lg of logs) {
      const txHash = lg.transactionHash;
      if (!txHash) continue;

      let from = "";
      let to = "";
      let value: bigint | null = null;
      try {
        const decoded = decodeEventLog({
          abi: [transferEvent],
          data: lg.data,
          topics: lg.topics,
        });
        if (decoded.eventName === "Transfer") {
          const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
          from = (args.from || "").toLowerCase();
          to = (args.to || "").toLowerCase();
          value = args.value;
        }
      } catch {
        continue;
      }
      if (!to || to !== receiverWalletAddress || value == null) continue;

      const amountNum = Number(formatUnits(value, decimals));
      if (!Number.isFinite(amountNum) || amountNum < 10) continue;

      const user = await db.user.findFirst({
        where: { walletAddress: from as string },
        select: { id: true },
      });
      if (!user) continue;

      const blockNum = lg.blockNumber;
      if (blockNum == null) continue;

      try {
        await assertBscDepositBlockNotExpired(client, blockNum);
        await finalizeVerifiedDeposit({
          userId: user.id,
          txHash,
          amount: Number(amountNum.toFixed(2)),
          note: `Auto-detected deposit ${txHash}`,
        });
        createdCount += 1;
        if (userIdFilter && user.id === userIdFilter) {
          createdForUser += 1;
        }
      } catch (error) {
        if (
          error instanceof DepositVerificationError &&
          (error.code === "DUPLICATE_TX" || error.code === "TX_EXPIRED")
        ) {
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json({ success: true, created: createdCount, createdForUser });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Scan failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
