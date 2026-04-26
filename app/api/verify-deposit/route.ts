import { NextResponse } from "next/server";
import {
  DepositVerificationError,
  finalizeVerifiedDeposit,
  INVALID_DEPOSIT_TX_MESSAGE,
  verifyUsdtDepositTransaction,
} from "@/lib/deposit-verification";
import { getUserApiContext } from "@/lib/user-api-auth";

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.effectiveStatus === "blocked") {
      return NextResponse.json({ error: "Account blocked" }, { status: 403 });
    }

    const body = await req.json();
    const transactionHash = String(body?.transactionHash || "").trim();
    if (!transactionHash) {
      return NextResponse.json({ error: INVALID_DEPOSIT_TX_MESSAGE }, { status: 400 });
    }

    const verified = await verifyUsdtDepositTransaction(transactionHash);

    /** Credits the logged-in user if TX is valid USDT → platform receiver. Sender can be any wallet or exchange. */
    const result = await finalizeVerifiedDeposit({
      userId: ctx.userId,
      txHash: verified.txHash,
      amount: verified.amount,
      note: `Deposit hash ${verified.txHash}`,
    });

    return NextResponse.json({
      success: true,
      txHash: verified.txHash,
      amount: verified.amount,
      depositId: result.deposit.id,
    });
  } catch (error) {
    if (error instanceof DepositVerificationError) {
      const status =
        error.code === "RECEIVER_NOT_CONFIGURED"
          ? 500
          : error.code === "DUPLICATE_TX"
            ? 409
            : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    const message = error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
