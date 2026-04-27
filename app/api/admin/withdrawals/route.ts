import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { requireAdminSection } from "@/lib/admin-api-guard";
import { ensureWithdrawalActorColumns, withWithdrawalColumnRetry } from "@/lib/withdrawal-ensure-column";
import { Prisma } from "@prisma/client";

// GET /api/admin/withdrawals?digitalPool=1 — pending only, Digital Pool–sourced (see `UserWithdrawSection` + `digitalPoolSource` on `Withdrawal`)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const digitalPoolOnly = url.searchParams.get("digitalPool") === "1" || url.searchParams.get("digitalPool") === "true";
    const gate = await requireAdminSection("withdrawals");
    if (!gate.ok) {
      if (digitalPoolOnly) {
        const gatePay = await requireAdminSection("payments");
        if (!gatePay.ok) return gate.response;
      } else {
        return gate.response;
      }
    }
    const db = getDb();
    const items = await withWithdrawalColumnRetry(db, () =>
      db.withdrawal.findMany({
        where: {
          status: "pending",
          ...(digitalPoolOnly ? { digitalPoolSource: true } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { user: { select: { id: true, username: true, email: true, walletAddress: true } } },
      }),
    );
    return NextResponse.json({ items, digitalPoolOnly });
  } catch {
    return NextResponse.json({ error: "Failed to fetch withdrawals" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const gate = await requireAdminSection("withdrawals");
    if (!gate.ok) return gate.response;
    const body = await req.json();
    const id = String(body?.id || "");
    const txHash = body?.txHash ? String(body.txHash) : undefined;
    const action = String(body?.action || "approve"); // approve | reject
    if (!id || (action === "approve" && !txHash)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const db = getDb();
    await ensureWithdrawalActorColumns(db);
    const w = await withWithdrawalColumnRetry(db, () => db.withdrawal.findUnique({ where: { id } }));
    if (!w || w.status !== "pending") {
      return NextResponse.json({ error: "Withdrawal not found or already processed" }, { status: 404 });
    }

    if (action === "reject") {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const gross =
        w.grossRequested != null ? Number(w.grossRequested) : Number(w.amount);
      const charityDec = Number(w.charityAmount ?? 0);
      const feePoolDec = Number(w.feePoolAmount ?? 0);

      const poolSource = Boolean((w as { digitalPoolSource?: boolean }).digitalPoolSource);

      await db.$transaction(async (tx) => {
        try {
          if (poolSource) {
            await tx.user.update({
              where: { id: w.userId },
              data: {
                digitalPoolWithdrawBalance: { increment: new Prisma.Decimal(gross.toFixed(2)) },
              } as any,
            });
          } else {
            await tx.user.update({
              where: { id: w.userId },
              data: { withdrawBalance: { increment: new Prisma.Decimal(gross.toFixed(2)) } } as any,
            });
          }
        } catch {
          if (poolSource) {
            await tx.$executeRawUnsafe(
              `UPDATE "User" SET "digitalPoolWithdrawBalance" = COALESCE("digitalPoolWithdrawBalance", 0) + $1 WHERE id = $2`,
              gross,
              w.userId
            );
          } else {
            await tx.$executeRawUnsafe(
              `UPDATE "User" SET "withdrawBalance" = COALESCE("withdrawBalance", 0) + $1 WHERE id = $2`,
              gross,
              w.userId
            );
          }
        }

        await tx.transaction.create({
          data: {
            userId: w.userId,
            sourceUserId: w.userId,
            level: 0,
            amount: new Prisma.Decimal(gross.toFixed(2)),
            type: "adjustment",
            note: poolSource
              ? `Digital Pool withdrawal rejected — refund to Digital Pool withdraw wallet (${gross} USDT gross)`
              : `Withdrawal rejected — refund to withdraw wallet (${gross} USDT gross)`,
          },
        });

        const fundUpdate: {
          charityTotal?: { decrement: Prisma.Decimal };
          feePoolTotal?: { decrement: Prisma.Decimal };
        } = {};
        if (charityDec > 0) {
          fundUpdate.charityTotal = { decrement: new Prisma.Decimal(charityDec.toFixed(2)) };
        }
        if (feePoolDec > 0) {
          fundUpdate.feePoolTotal = { decrement: new Prisma.Decimal(feePoolDec.toFixed(2)) };
        }
        if (Object.keys(fundUpdate).length > 0) {
          try {
            await tx.platformFund.update({
              where: { id: "default" },
              data: fundUpdate,
            });
          } catch {
            /* fund row may be missing on old DBs */
          }
        }

        try {
          await tx.withdrawal.update({
            where: { id },
            data: { status: "rejected", rejectedByUserId: session.user.id },
          });
        } catch (e) {
          await tx.withdrawal.update({
            where: { id },
            data: { status: "rejected" },
          });
          try {
            await tx.$executeRawUnsafe(
              `UPDATE "Withdrawal" SET "rejectedByUserId" = $1 WHERE id = $2`,
              session.user.id,
              id,
            );
          } catch {
            console.warn("withdrawal reject: could not set rejectedByUserId");
          }
        }
      });

      return NextResponse.json({ success: true, status: "rejected" });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await db.withdrawal.update({
        where: { id },
        data: {
          status: "approved",
          txHash,
          approvedByUserId: session.user.id,
        },
      });
    } catch (e) {
      console.error("withdrawal approve (with approvedByUserId) failed, retrying minimal update + raw approver", e);
      await db.withdrawal.update({
        where: { id },
        data: { status: "approved", txHash },
      });
      try {
        await db.$executeRawUnsafe(
          `UPDATE "Withdrawal" SET "approvedByUserId" = $1 WHERE id = $2`,
          session.user.id,
          id
        );
      } catch (e2) {
        console.warn("withdrawal approve: could not set approvedByUserId (run prisma migrate)", e2);
      }
    }
    return NextResponse.json({ success: true, status: "approved" });
  } catch (e) {
    console.error("PATCH /api/admin/withdrawals", e);
    return NextResponse.json({ error: "Failed to update withdrawal" }, { status: 500 });
  }
}
