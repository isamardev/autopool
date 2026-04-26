import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdminSection, requireSuperAdmin } from "@/lib/admin-api-guard";
import { runActivationPayoutEngine } from "@/lib/mlm-logic";
import { MANUAL_SUSPEND_SOURCE } from "@/lib/team-withdraw-activity";
import { reconcileDigitalPoolAfterTeamChange } from "@/lib/digital-pool-credential-db";

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function countsTowardBinaryTree(status: string): boolean {
  return status !== "inactive";
}

/** DBs created before schema sync may miss optional columns; Prisma update needs them. */
async function ensureUserWithdrawColumns(db: ReturnType<typeof getDb>): Promise<void> {
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "permanentWithdrawAddress" TEXT`);
  } catch (e) {
    console.error("ensureUserWithdrawColumns: permanentWithdrawAddress", e);
  }
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "usdtBalance" DECIMAL(18,2) DEFAULT 0`);
  } catch (e) {
    console.error("ensureUserWithdrawColumns: usdtBalance", e);
  }
}

async function getUsdtBalanceFromDb(db: ReturnType<typeof getDb>, userId: string): Promise<number> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ v: unknown }>>(
      `SELECT COALESCE("usdtBalance", 0) AS v FROM "User" WHERE id = $1`,
      userId,
    );
    return Number(rows?.[0]?.v ?? 0);
  } catch {
    return 0;
  }
}

export async function PATCH(req: Request) {
  try {
    const gate = await requireAdminSection("users");
    if (!gate.ok) return gate.response;
    const canEditBalances = gate.fullAccess === true;

    const body = await req.json();
    const {
      id,
      username,
      email,
      phone,
      country,
      balance,
      withdrawBalance,
      usdtBalance,
      status,
      securityCode,
      permanentWithdrawAddress,
      adminRoleId,
      newPassword,
    } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }

    const db = getDb();
    await ensureUserWithdrawColumns(db);

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const oldUsdt = await getUsdtBalanceFromDb(db, id);

    const prismaData: Record<string, unknown> = {};
    if (username !== undefined && username !== null) {
      const u = String(username).trim();
      if (!u.length) {
        return NextResponse.json({ error: "VALIDATION" }, { status: 400 });
      }
      prismaData.username = u;
    }
    let emailChanging = false;
    let phoneChanging = false;
    if (email !== undefined && email !== null) {
      const em = String(email).trim().toLowerCase();
      if (!em.length || !em.includes("@")) {
        return NextResponse.json({ error: "VALIDATION" }, { status: 400 });
      }
      emailChanging = em !== user.email;
      prismaData.email = em;
    }
    if (phone !== undefined && phone !== null) {
      const ph = String(phone);
      phoneChanging = ph !== (user.phone ?? "");
      prismaData.phone = ph;
    }
    if ((emailChanging || phoneChanging) && user.emailVerifiedAt) {
      prismaData.emailVerifiedAt = user.emailVerifiedAt;
    }
    if (country !== undefined && country !== null) {
      prismaData.country = String(country);
    }
    if (canEditBalances && balance !== undefined && balance !== null) {
      prismaData.balance = new Prisma.Decimal(num(balance).toFixed(2));
    }
    if (canEditBalances && withdrawBalance !== undefined && withdrawBalance !== null) {
      prismaData.withdrawBalance = new Prisma.Decimal(num(withdrawBalance).toFixed(2));
    }
    if (status !== undefined && status !== null) {
      prismaData.status = status;
      const st = String(status);
      if (st === "withdraw_suspend") {
        prismaData.withdrawSuspendSource = MANUAL_SUSPEND_SOURCE;
      } else {
        prismaData.withdrawSuspendSource = null;
      }
      /** Manual withdraw re-enable: same fresh window as team timer (`TEAM_INACTIVITY_DAYS` from last activity). */
      if (st === "active" && user.status === "withdraw_suspend") {
        prismaData.lastDownlineActivityAt = new Date();
      }
    }
    if (securityCode !== undefined) {
      const s = String(securityCode ?? "").trim();
      prismaData.securityCode = s.length ? s : null;
    }

    /** Set via raw SQL — avoids Prisma client/schema drift on optional columns. */
    let persistWithdrawAddress: string | null | undefined = undefined;
    if (permanentWithdrawAddress !== undefined) {
      const raw = String(permanentWithdrawAddress ?? "").trim().replace(/\s+/g, "");
      if (raw.length > 0 && !/^0x[a-fA-F0-9]{40}$/.test(raw)) {
        return NextResponse.json({ error: "INVALID_ADDRESS" }, { status: 400 });
      }
      persistWithdrawAddress = raw.length > 0 ? raw : null;
    }

    const np = typeof newPassword === "string" ? newPassword.trim() : "";
    if (np.length > 0) {
      if (np.length < 6) {
        return NextResponse.json({ error: "VALIDATION" }, { status: 400 });
      }
      prismaData.passwordHash = await bcrypt.hash(np, 12);
      if (user.adminRoleId || user.status === "admin") {
        prismaData.staffPasswordPlain = np;
      } else {
        prismaData.staffPasswordPlain = null;
      }
    }

    if (adminRoleId !== undefined) {
      const superGate = await requireSuperAdmin();
      if (!superGate.ok) return superGate.response;
      const raw = adminRoleId === null || adminRoleId === "" ? null : String(adminRoleId);
      if (raw) {
        const role = await db.adminRole.findUnique({ where: { id: raw } });
        if (!role) {
          return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
        }
        prismaData.adminRoleId = raw;
      } else {
        prismaData.adminRoleId = null;
      }
    }

    const newUsdt =
      usdtBalance !== undefined && canEditBalances ? num(usdtBalance) : oldUsdt;
    const usdtDelta =
      usdtBalance !== undefined && canEditBalances ? newUsdt - oldUsdt : 0;

    const persistUsdtBalance = usdtBalance !== undefined && canEditBalances ? newUsdt : undefined;

    const willActivate =
      status !== undefined &&
      status !== null &&
      String(status) === "active" &&
      user.status === "inactive";

    if (willActivate) {
      try {
        await runActivationPayoutEngine({
          sourceUserId: id,
          activationAmount: 10,
          note: "Admin activation",
          skipUserDeduction: true,
        });
      } catch (actErr) {
        console.error("Admin user update: activation engine failed", actErr);
        return NextResponse.json({ error: "ACTIVATION_FAILED" }, { status: 500 });
      }
      delete prismaData.status;
    }

    const hasPrismaPatch = Object.keys(prismaData).length > 0;
    const hasAddressPatch = persistWithdrawAddress !== undefined;
    const hasUsdtPatch = persistUsdtBalance !== undefined;
    const hasDepositLog =
      canEditBalances && usdtBalance !== undefined && usdtDelta > 0.0001;
    if (!hasPrismaPatch && !hasAddressPatch && !hasUsdtPatch && !hasDepositLog) {
      return NextResponse.json({ success: true });
    }

    await db.$transaction(async (tx) => {
      if (Object.keys(prismaData).length > 0) {
        await tx.user.update({
          where: { id },
          data: prismaData as Prisma.UserUpdateInput,
        });
      }

      if (persistWithdrawAddress !== undefined) {
        await tx.$executeRawUnsafe(
          `UPDATE "User" SET "permanentWithdrawAddress" = $1 WHERE id = $2`,
          persistWithdrawAddress,
          id,
        );
      }

      if (persistUsdtBalance !== undefined) {
        await tx.$executeRawUnsafe(
          `UPDATE "User" SET "usdtBalance" = $1 WHERE id = $2`,
          persistUsdtBalance,
          id,
        );
      }

      // Total Deposits on admin dashboard = sum of confirmed Deposit rows; manual Balance (USDT) credits must log here too
      if (canEditBalances && usdtBalance !== undefined && usdtDelta > 0.0001) {
        const txHash = `admin-panel-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
        await tx.deposit.create({
          data: {
            userId: id,
            chain: "BSC",
            txHash,
            amount: new Prisma.Decimal(usdtDelta.toFixed(2)),
            status: "confirmed",
            verifiedAt: new Date(),
          },
        });
      }
    });

    const nextStatus = status !== undefined && status !== null ? String(status) : user.status;
    if (willActivate || countsTowardBinaryTree(user.status) !== countsTowardBinaryTree(nextStatus)) {
      try {
        await reconcileDigitalPoolAfterTeamChange(db, id);
      } catch (e) {
        console.error("Admin user update: digital pool reconcile failed", e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Admin user update error:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Prisma meta:", error.code, error.meta);
    }
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }
}
