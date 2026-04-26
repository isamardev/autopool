import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getUserApiContext } from "@/lib/user-api-auth";
import { Prisma } from "@prisma/client";
import { MIN_WITHDRAW_OR_P2P_USDT } from "@/lib/wallet-limits";

const schema = z.object({
  recipient: z.string().min(3),
  amount: z.number().positive(),
  securityCode: z.string().min(1).optional(),
  preview: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = getDb();
    const senderId = ctx.userId;
    const { amount, recipient: key, securityCode, preview } = parsed.data;
    const amt = Number(amount.toFixed(2));
    if (amt < MIN_WITHDRAW_OR_P2P_USDT) {
      return NextResponse.json(
        { error: `Minimum transfer amount is ${MIN_WITHDRAW_OR_P2P_USDT} USDT` },
        { status: 400 },
      );
    }

    const sender = await db.user.findUnique({ where: { id: senderId } });
    if (!sender) {
      return NextResponse.json({ error: "Sender not found" }, { status: 404 });
    }

    let senderSecurityCode = (sender as any).securityCode;
    if (senderSecurityCode === undefined) {
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT "securityCode" FROM "User" WHERE id = $1`,
        senderId
      );
      senderSecurityCode = rows[0]?.securityCode;
    }

    let usdtBalance = Number((sender as any).usdtBalance ?? 0);
    if ((sender as any).usdtBalance === undefined) {
      try {
        const rows: any[] = await db.$queryRawUnsafe(
          `SELECT "usdtBalance" FROM "User" WHERE id = $1`,
          senderId
        );
        usdtBalance = Number(rows[0]?.usdtBalance ?? 0);
      } catch (err) {
        usdtBalance = 0;
      }
    }

    if (usdtBalance < amt) {
      return NextResponse.json({ error: "Insufficient balance in USDT wallet" }, { status: 400 });
    }

    let recipient =
      key.includes("@")
        ? await db.user.findUnique({ where: { email: key.toLowerCase() }, select: { id: true, username: true, email: true, status: true } })
        : await db.user.findUnique({ where: { referrerCode: key }, select: { id: true, username: true, email: true, status: true } });

    if (!recipient) {
      recipient = await db.user.findFirst({ where: { username: key }, select: { id: true, username: true, email: true, status: true } });
    }
    if (!recipient) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }
    if (recipient.id === senderId) {
      return NextResponse.json({ error: "Cannot transfer to self" }, { status: 400 });
    }
    // Allow pre-activation (`inactive`) users to receive P2P; only hard-blocked accounts cannot receive.
    if (recipient.status === "blocked") {
      return NextResponse.json({ error: "Recipient unavailable" }, { status: 400 });
    }

    if (preview) {
      return NextResponse.json({
        preview: true,
        recipient: { id: recipient.id, username: recipient.username, email: recipient.email },
        amount: amt,
      });
    }

    if (!senderSecurityCode) {
      return NextResponse.json({ error: "Security code not set. Please set it in My Profile." }, { status: 400 });
    }
    if (senderSecurityCode !== (securityCode || "")) {
      return NextResponse.json({ error: "Invalid security code" }, { status: 401 });
    }

    await db.$transaction(async (tx) => {
      try {
        await tx.user.update({
          where: { id: senderId },
          data: { usdtBalance: { decrement: new Prisma.Decimal(amt.toFixed(2)) } } as any,
        });
      } catch (e) {
        await tx.$executeRawUnsafe(
          `UPDATE "User" SET "usdtBalance" = "usdtBalance" - $1 WHERE id = $2`,
          amt, senderId
        );
      }
      
      try {
        await tx.user.update({
          where: { id: recipient!.id },
          data: { usdtBalance: { increment: new Prisma.Decimal(amt.toFixed(2)) } } as any,
        });
      } catch (e) {
        try {
          await tx.$executeRawUnsafe(
            `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "usdtBalance" DECIMAL(18,2) DEFAULT 0`
          );
        } catch {}
        await tx.$executeRawUnsafe(
          `UPDATE "User" SET "usdtBalance" = COALESCE("usdtBalance", 0) + $1 WHERE id = $2`,
          amt, recipient!.id
        );
      }
      await tx.transaction.create({
        data: {
          userId: senderId,
          sourceUserId: senderId,
          level: 0,
          amount: new Prisma.Decimal((-amt).toFixed(2)),
          type: "adjustment",
          note: `P2P to ${recipient!.username} (to USDT wallet)`,
        },
      });
      await tx.transaction.create({
        data: {
          userId: recipient!.id,
          sourceUserId: senderId,
          level: 0,
          amount: new Prisma.Decimal(amt.toFixed(2)),
          type: "adjustment",
          note: `P2P from ${sender.username} (to USDT wallet)`,
        },
      });
      await tx.notification.create({
        data: {
          userId: recipient!.id,
          type: "system",
          title: "P2P Transfer Received",
          message: `You received ${amt} from ${sender.username}`,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "P2P transfer failed" }, { status: 500 });
  }
}
