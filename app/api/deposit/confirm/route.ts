import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { finalizeVerifiedDeposit } from "@/lib/deposit-verification";

const schema = z.object({
  sourceUserId: z.string().min(12),
  amount: z.number().positive(),
  note: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (session.user.status !== "admin" && session.user.id !== parsed.data.sourceUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const txHash = `app:${Date.now()}:${parsed.data.sourceUserId}`;
    await finalizeVerifiedDeposit({
      userId: parsed.data.sourceUserId,
      txHash,
      amount: Number(parsed.data.amount.toFixed(2)),
      note: parsed.data.note || "Deposit",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Deposit confirmation failed" }, { status: 500 });
  }
}
