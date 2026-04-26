import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSection } from "@/lib/admin-api-guard";
import { DepositVerificationError, finalizeVerifiedDeposit, INVALID_DEPOSIT_TX_MESSAGE } from "@/lib/deposit-verification";

const schema = z.object({
  sourceUserId: z.string().min(10),
  txHash: z.string().min(20),
  amount: z.number().positive(),
  chain: z.enum(["BSC"]).default("BSC"),
});

async function verifyOnBscScan(txHash: string) {
  const key = process.env.BSCSCAN_API_KEY;
  if (!key) return { verified: false, raw: null };
  const url = `https://api.bscscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${encodeURIComponent(txHash)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { verified: false, raw: null };
  const json = (await res.json()) as unknown;
  const ok = typeof json === "object" && json !== null && "result" in json && (json as any).result;
  return { verified: Boolean(ok), raw: json };
}

export async function POST(req: Request) {
  try {
    const gate = await requireAdminSection("deposits");
    if (!gate.ok) return gate.response;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const txHash = parsed.data.txHash.trim();

    const verify = await verifyOnBscScan(txHash);
    if (!verify.verified && process.env.BSCSCAN_API_KEY) {
      return NextResponse.json({ error: "Hash not verified on BscScan" }, { status: 400 });
    }

    const result = await finalizeVerifiedDeposit({
      userId: parsed.data.sourceUserId,
      txHash,
      amount: parsed.data.amount,
      note: `Deposit hash ${txHash}`,
    });

    return NextResponse.json({
      success: true,
      deposit: { id: result.deposit.id, txHash, status: "confirmed" },
      payout: result.payout,
      bscScan: verify.raw,
    });
  } catch (error) {
    if (error instanceof DepositVerificationError) {
      return NextResponse.json(
        { error: error.code === "DUPLICATE_TX" ? INVALID_DEPOSIT_TX_MESSAGE : error.message },
        { status: error.code === "DUPLICATE_TX" ? 409 : 400 },
      );
    }
    return NextResponse.json({ error: "Verify hash failed" }, { status: 500 });
  }
}
