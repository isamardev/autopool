import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdminSection } from "@/lib/admin-api-guard";
import { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const gate = await requireAdminSection("overview");
    if (!gate.ok) return gate.response;

    const db = getDb();

    const depAgg = await db.deposit.aggregate({
      where: { status: "confirmed" },
      _sum: { amount: true },
    });
    const comAgg = await db.transaction.aggregate({
      _sum: { amount: true },
      where: { type: "commission" },
    });

    const sumDeposits = Number(depAgg._sum.amount ?? 0);
    const sumCommissions = Number(comAgg._sum.amount ?? 0);
    const systemBalance = Number((sumDeposits - sumCommissions).toFixed(2));

    return NextResponse.json({ systemBalance, sumDeposits, sumCommissions });
  } catch {
    return NextResponse.json({ error: "Failed to compute system balance" }, { status: 500 });
  }
}
