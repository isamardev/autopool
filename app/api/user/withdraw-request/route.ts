import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getUserApiContext } from "@/lib/user-api-auth";
import { Prisma } from "@prisma/client";
import { MIN_WITHDRAW_OR_P2P_USDT, WITHDRAW_FEE_PERCENT, withdrawNetAfterFee } from "@/lib/wallet-limits";
import { splitWithdrawalFeeToCharityAndFeePool } from "@/lib/platform-fee-split";
import {
  applyAutoWithdrawSuspendIfStaleForUser,
  tryRepairAutoWithdrawSuspendFromDownlineProof,
} from "@/lib/team-withdraw-activity";

const schema = z.object({
  amount: z.number().positive(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  securityCode: z.string().min(1),
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
    const { amount, address, securityCode } = parsed.data;

    try {
      await tryRepairAutoWithdrawSuspendFromDownlineProof(db, userId);
    } catch (e) {
      console.error("withdraw-request: tryRepairAutoWithdrawSuspendFromDownlineProof", e);
    }
    await applyAutoWithdrawSuspendIfStaleForUser(db, userId);

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { digitalPoolCredential: true }
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (ctx.isDigitalPool) {
      if (user.digitalPoolWithdrawSuspend) {
        return NextResponse.json(
          { error: "Pool withdrawals are suspended. Please contact customer support." },
          { status: 403 },
        );
      }
    } else {
      if (user.status === "withdraw_suspend") {
        return NextResponse.json(
          { error: "Withdrawals are suspended. Please contact customer support." },
          { status: 403 },
        );
      }
    }

    // Check if user has a permanent withdrawal address set
    let permanentWithdrawAddress: string | null = null;
    if (ctx.isDigitalPool) {
      permanentWithdrawAddress = user.digitalPoolCredential?.permanentWithdrawAddress ?? null;
    } else {
      permanentWithdrawAddress = (user as any).permanentWithdrawAddress ?? null;
      if ((user as any).permanentWithdrawAddress === undefined) {
        try {
          const rows: any[] = await db.$queryRawUnsafe(
            `SELECT "permanentWithdrawAddress" FROM "User" WHERE id = $1`,
            userId
          );
          if (rows && rows.length > 0) {
            permanentWithdrawAddress = rows[0].permanentWithdrawAddress ?? rows[0].permanentwithdrawaddress;
          }
        } catch (err) {
          permanentWithdrawAddress = null;
        }
      }
    }

    if (permanentWithdrawAddress && address !== permanentWithdrawAddress) {
      return NextResponse.json({ error: "Withdrawals only allowed to your saved permanent address" }, { status: 400 });
    }

    // Handle security code check
    let userSecurityCode: string | null = null;
    if (ctx.isDigitalPool) {
      userSecurityCode = user.digitalPoolCredential?.securityCode ?? null;
    } else {
      userSecurityCode = (user as any).securityCode ?? null;
      if ((user as any).securityCode === undefined) {
        const rows: any[] = await db.$queryRawUnsafe(
          `SELECT "securityCode" FROM "User" WHERE id = $1`,
          userId
        );
        userSecurityCode = rows[0]?.securityCode ?? null;
      }
    }

    if (!userSecurityCode) {
      return NextResponse.json({ error: "Security code not set. Please set it in My Profile." }, { status: 400 });
    }

    if (userSecurityCode !== securityCode) {
      return NextResponse.json({ error: "Invalid security code" }, { status: 401 });
    }

    // Safely get withdrawBalance
    let withdrawBalance = 0;
    if (ctx.isDigitalPool) {
      withdrawBalance = Number(user.digitalPoolWithdrawBalance ?? 0);
    } else {
      withdrawBalance = Number((user as any).withdrawBalance ?? 0);
      if ((user as any).withdrawBalance === undefined) {
        try {
          const rows: any[] = await db.$queryRawUnsafe(
            `SELECT "withdrawBalance" FROM "User" WHERE id = $1`,
            userId
          );
          withdrawBalance = Number(rows[0]?.withdrawBalance ?? rows[0]?.withdrawbalance ?? 0);
        } catch (err) {
          withdrawBalance = 0;
        }
      }
    }

    const gross = Number(amount.toFixed(2));
    if (gross < MIN_WITHDRAW_OR_P2P_USDT) {
      return NextResponse.json(
        { error: `Minimum withdrawal amount is ${MIN_WITHDRAW_OR_P2P_USDT} USDT` },
        { status: 400 },
      );
    }
    if (withdrawBalance < gross) {
      return NextResponse.json({ error: "Insufficient balance in withdrawal wallet" }, { status: 400 });
    }

    const net = withdrawNetAfterFee(gross);
    const feeAmount = Number((gross - net).toFixed(2));
    const { charity: charityShare, feePool: feePoolShare } = splitWithdrawalFeeToCharityAndFeePool(feeAmount);

    const withdrawal = await db.$transaction(async (tx) => {
      // Deduct full requested (gross) from appropriate wallet; payout record is net after fee.
      if (ctx.isDigitalPool) {
        try {
          await tx.user.update({
            where: { id: userId },
            data: { digitalPoolWithdrawBalance: { decrement: new Prisma.Decimal(gross.toFixed(2)) } } as any,
          });
        } catch (e) {
          await tx.$executeRawUnsafe(
            `UPDATE "User" SET "digitalPoolWithdrawBalance" = "digitalPoolWithdrawBalance" - $1 WHERE id = $2`,
            gross, userId
          );
        }
      } else {
        try {
          await tx.user.update({
            where: { id: userId },
            data: { withdrawBalance: { decrement: new Prisma.Decimal(gross.toFixed(2)) } } as any,
          });
        } catch (e) {
          await tx.$executeRawUnsafe(
            `UPDATE "User" SET "withdrawBalance" = "withdrawBalance" - $1 WHERE id = $2`,
            gross, userId
          );
        }
      }
      
      await tx.transaction.create({
        data: {
          userId,
          sourceUserId: userId,
          level: 0,
          amount: new Prisma.Decimal((-gross).toFixed(2)),
          type: "adjustment",
          note: ctx.isDigitalPool 
            ? `Digital Pool withdrawal request lock (${WITHDRAW_FEE_PERCENT}% fee)`
            : `Withdrawal request lock (from withdraw wallet, ${WITHDRAW_FEE_PERCENT}% fee)`,
        },
      });
      const w = await tx.withdrawal.create({
        data: {
          userId,
          address,
          amount: new Prisma.Decimal(net.toFixed(2)),
          status: "pending",
          grossRequested: new Prisma.Decimal(gross.toFixed(2)),
          feeAmount: new Prisma.Decimal(feeAmount.toFixed(2)),
          digitalPoolSource: ctx.isDigitalPool,
          charityAmount:
            charityShare > 0 ? new Prisma.Decimal(charityShare.toFixed(2)) : null,
          feePoolAmount:
            feePoolShare > 0 ? new Prisma.Decimal(feePoolShare.toFixed(2)) : null,
        },
      });
      await tx.notification.create({
        data: {
          userId,
          type: "system",
          title: "Withdrawal requested",
          message: `You will receive ${net} USDT (${WITHDRAW_FEE_PERCENT}% fee deducted from ${gross} USDT) to ${address}`,
        },
      });

      if (charityShare > 0 || feePoolShare > 0) {
        await tx.platformFund.upsert({
          where: { id: "default" },
          create: {
            id: "default",
            charityTotal: new Prisma.Decimal(charityShare.toFixed(2)),
            feePoolTotal: new Prisma.Decimal(feePoolShare.toFixed(2)),
          },
          update: {
            charityTotal: { increment: new Prisma.Decimal(charityShare.toFixed(2)) },
            feePoolTotal: { increment: new Prisma.Decimal(feePoolShare.toFixed(2)) },
          },
        });
      }

      return w;
    });

    return NextResponse.json({ success: true, withdrawal });
  } catch {
    return NextResponse.json({ error: "Withdrawal request failed" }, { status: 500 });
  }
}
