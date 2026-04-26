import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getUserApiContext } from "@/lib/user-api-auth";
import { INTERNAL_TRANSFER_WITHDRAW_TO_USDT_NOTE } from "@/lib/internal-transfer-constants";
import { applyAutoWithdrawSuspendIfStaleForUser } from "@/lib/team-withdraw-activity";

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.effectiveStatus === "blocked") {
      return NextResponse.json({ error: "Account blocked" }, { status: 403 });
    }

    const { amount, securityCode, source, target } = await req.json();
    const userId = ctx.userId;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (!securityCode) {
      return NextResponse.json({ error: "Security Code is required" }, { status: 400 });
    }

    const db = getDb();
    await applyAutoWithdrawSuspendIfStaleForUser(db, userId);

    // 1. Get user and verify security code
    // Fetch all balance fields to verify correctly
    let user: any = null;
    try {
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT id, balance, "withdrawBalance", "usdtBalance", "securityCode", status FROM "User" WHERE id = $1`,
        userId
      );
      if (rows && rows.length > 0) {
        user = rows[0];
      }
    } catch (e) {
      user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, balance: true, securityCode: true, status: true },
      });
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userStatus = String((user as any).status ?? "");
    if (userStatus === "withdraw_suspend" && source === "withdraw") {
      return NextResponse.json(
        { error: "Withdrawals are suspended. Please contact customer support." },
        { status: 403 },
      );
    }

    if (user.securityCode !== securityCode.trim()) {
      return NextResponse.json({ error: "Invalid Security Code" }, { status: 401 });
    }

    const sourceField = source === "withdraw" ? "withdrawBalance" : "usdtBalance";
    const sourceLabel = source === "withdraw" ? "Withdraw Wallet" : "USDT Wallet (Main)";
    
    const targetField = target === "usdt" ? "usdtBalance" : "withdrawBalance";
    const targetLabel = target === "usdt" ? "USDT Wallet" : "Withdraw Wallet";

    if (!(source === "withdraw" && target === "usdt")) {
      return NextResponse.json({ error: "Only transfer from Withdraw Wallet to USDT Wallet is allowed" }, { status: 400 });
    }

    const sourceBalance = Number(user[sourceField] ?? 0);
    if (sourceBalance < amount) {
      return NextResponse.json({ error: `Insufficient balance in ${sourceLabel}` }, { status: 400 });
    }

    // 2. Perform transfer
    try {
      const amt = Number(amount);
      
      // Ensure columns exist first
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "usdtBalance" DECIMAL(18,2) DEFAULT 0`);
        await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "withdrawBalance" DECIMAL(18,2) DEFAULT 0`);
      } catch (e) { /* silent */ }

      // Update both wallets in a single query for atomicity
      try {
        await db.$executeRawUnsafe(
          `UPDATE "User" SET "${sourceField}" = "${sourceField}" - $1, "${targetField}" = COALESCE("${targetField}", 0) + $2 WHERE id = $3`,
          amt, amt, userId
        );
      } catch (sqlErr: any) {
        // Fallback for unquoted if necessary (although quoted is standard for camelCase)
        await db.$executeRawUnsafe(
          `UPDATE "User" SET ${sourceField} = ${sourceField} - $1, ${targetField} = COALESCE(${targetField}, 0) + $2 WHERE id = $3`,
          amt, amt, userId
        );
      }

      // Log the transaction
      try {
        await db.transaction.create({
          data: {
            userId: userId,
            sourceUserId: userId,
            level: 0,
            amount: amt,
            type: "adjustment",
            note: INTERNAL_TRANSFER_WITHDRAW_TO_USDT_NOTE,
          }
        });
      } catch (logErr) {
        console.error("Failed to log internal transfer:", logErr);
      }
    } catch (e: any) {
      console.error("Internal transfer execution failed:", e.message);
      return NextResponse.json({ error: `Transfer failed: ${e.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Transfer successful" });
  } catch (error) {
    console.error("Internal transfer error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
