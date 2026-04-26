import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getUserApiContext } from "@/lib/user-api-auth";

const schema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid USDT (BEP20) address"),
});

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = getDb();
    const userId = ctx.userId;
    const { address } = parsed.data;

    // Check if user already has an address saved
    let existingAddress = null;
    try {
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT permanentWithdrawAddress FROM "User" WHERE id = $1`,
        userId
      );
      if (rows && rows.length > 0) {
        existingAddress = rows[0].permanentwithdrawaddress ?? rows[0].permanentWithdrawAddress;
      }
    } catch (e) {
      try {
        const rows: any[] = await db.$queryRawUnsafe(
          `SELECT permanentwithdrawaddress FROM "User" WHERE id = $1`,
          userId
        );
        if (rows && rows.length > 0) {
          existingAddress = rows[0].permanentwithdrawaddress;
        }
      } catch (inner) { /* silent */ }
    }

    if (existingAddress) {
      return NextResponse.json({ 
        error: "Withdrawal address is already set and cannot be changed",
        address: existingAddress 
      }, { status: 400 });
    }

    // Save the address (one-time)
    try {
      await db.$executeRawUnsafe(
        `UPDATE "User" SET "permanentWithdrawAddress" = $1 WHERE id = $2`,
        address, userId
      );
    } catch (e) {
      // In case column is missing, although it should be added by dashboard route
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "permanentWithdrawAddress" TEXT`);
        await db.$executeRawUnsafe(
          `UPDATE "User" SET "permanentWithdrawAddress" = $1 WHERE id = $2`,
          address, userId
        );
      } catch (err) {
        return NextResponse.json({ error: "Failed to save withdrawal address" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Withdrawal address saved permanently" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
