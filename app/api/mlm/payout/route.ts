import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { runMlmPayoutEngine } from "@/lib/mlm-logic";

const schema = z.object({
  sourceUserId: z.string().min(12),
  amount: z.number().positive(),
  note: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.status !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await runMlmPayoutEngine({
      sourceUserId: parsed.data.sourceUserId,
      depositAmount: parsed.data.amount,
      note: parsed.data.note ?? "MLM payout request",
    });

    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ error: "Payout failed" }, { status: 500 });
  }
}

