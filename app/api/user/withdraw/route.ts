import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getUserApiContext } from "@/lib/user-api-auth";
import { Prisma } from "@prisma/client";

const schema = z.object({
  amount: z.number().positive(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.effectiveStatus === "inactive") {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }
    if (ctx.effectiveStatus === "blocked") {
      return NextResponse.json({ error: "Account blocked" }, { status: 403 });
    }
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = getDb();
    const userId = ctx.userId;
    const amt = Number(parsed.data.amount.toFixed(2));

    const user = await db.user.findUnique({ where: { id: userId }, select: { balance: true } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const bal = Number(user.balance ?? 0);
    if (bal < amt) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: new Prisma.Decimal(amt.toFixed(2)) } },
      });
      await tx.transaction.create({
        data: {
          userId,
          sourceUserId: userId,
          level: 0,
          amount: new Prisma.Decimal((-amt).toFixed(2)),
          type: "adjustment",
          note: "User withdrawal",
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Withdraw failed" }, { status: 500 });
  }
}
