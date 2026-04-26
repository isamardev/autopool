import { getDb } from "@/lib/db";
import { MLM_SETTINGS_KEY } from "@/lib/mlm-settings-key";
import { Prisma } from "@prisma/client";
import { getUserMainAndUsdtBalance } from "@/lib/user-balances";
import { isActivatedMemberStatus } from "@/lib/user-status";

/** Interactive transaction options — Prisma default 5s is too short for L1–20 MLM loops + Neon latency. */
export const INTERACTIVE_TX_OPTIONS = {
  maxWait: 20_000,
  timeout: 120_000,
} as const;

type PayoutResult = {
  level: number;
  beneficiaryUserId: string;
  amount: number;
};

type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["$transaction"]>[0]>[0];

/**
 * Sponsor chain from depositor upward: [0]=direct sponsor (L1), [1]=their sponsor (L2), …
 * DB is single-parent (`referredById`): each user has one upline path. “Legs” are separate subtrees
 * under each user; a deposit only travels up the **one path** that contains the depositor — so each
 * upline is paid only if they are within **20 generations** on that path (L1…L20). No pay to 21st+ upline.
 */
async function loadSponsorChainIds(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["$transaction"]>[0]>[0],
  sourceReferredById: string | null,
): Promise<string[]> {
  const chain: string[] = [];
  let currentId: string | null = sourceReferredById;
  while (currentId) {
    const parent = await tx.user.findUnique({
      where: { id: currentId },
      select: { id: true, referredById: true },
    });
    if (!parent) break;
    chain.push(parent.id);
    currentId = parent.referredById ?? null;
  }
  return chain;
}

export { MLM_SETTINGS_KEY };
export const DEFAULT_LEVEL_PERCENTAGES = [
  10, 5, 4, 3, 2, 2, 1.5, 1.5, 1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.4, 0.4, 0.3, 0.3,
];

/**
 * When true (default), the $10 activation follows the same L1–L20 × $0.50 split as deposits: uplines get $0.50 per
 * level (up to chain depth), remainder to admin — e.g. direct-only user → $10 admin; user under a sponsor → $0.50
 * to L1, $9.50 to admin, etc.
 * Set ACTIVATION_DISTRIBUTE_TO_UPLINES=false to send the full $10 to admin every time (legacy).
 */
export function isActivationUplineSplitEnabled(): boolean {
  const v = (process.env.ACTIVATION_DISTRIBUTE_TO_UPLINES ?? "true").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

function activationDistributesToUplines(): boolean {
  return isActivationUplineSplitEnabled();
}

/**
 * Sponsor path [L1, L2, …] — same order as `loadSponsorChainIds` / `runActivationPayoutEngine` (walk from `referredById` upward).
 */
export async function getSponsorChainIdsFromReferredById(referredById: string | null): Promise<string[]> {
  const db = getDb();
  const chain: string[] = [];
  let currentId: string | null = referredById;
  while (currentId) {
    const parent = await db.user.findUnique({
      where: { id: currentId },
      select: { id: true, referredById: true },
    });
    if (!parent) break;
    chain.push(parent.id);
    currentId = parent.referredById ?? null;
  }
  return chain;
}

export async function getSponsorChainLengthFromReferredById(referredById: string | null): Promise<number> {
  const c = await getSponsorChainIdsFromReferredById(referredById);
  return c.length;
}

const DEFAULT_ACTIVATION_USD = 10;
const DEFAULT_ACTIVATION_PER_LEVEL_USD = 0.5;

/**
 * Total $ credited to admin users from one activation — mirrors `runActivationPayoutEngine`:
 * $0.50 per level to chain[L] when that beneficiary is an admin account, plus full remainder to platform admin.
 */
export function expectedAdminActivationCreditUsd(
  sponsorChainUserIds: string[],
  adminUserIds: readonly string[] | Set<string>,
  splitEnabled: boolean,
  activationAmount: number = DEFAULT_ACTIVATION_USD,
  perLevel: number = DEFAULT_ACTIVATION_PER_LEVEL_USD,
): number {
  if (!splitEnabled) return Number(activationAmount.toFixed(2));
  const adminSet = adminUserIds instanceof Set ? adminUserIds : new Set(adminUserIds);
  let remaining = Number(activationAmount.toFixed(2));
  let adminCredit = 0;
  for (let level = 1; level <= 20 && remaining >= perLevel - 1e-9; level += 1) {
    const idx = level - 1;
    if (idx >= sponsorChainUserIds.length) break;
    const beneficiaryId = sponsorChainUserIds[idx];
    remaining = Number((remaining - perLevel).toFixed(2));
    if (adminSet.has(beneficiaryId)) {
      adminCredit = Number((adminCredit + perLevel).toFixed(2));
    }
  }
  if (remaining > 0) {
    adminCredit = Number((adminCredit + remaining).toFixed(2));
  }
  return Number(adminCredit.toFixed(2));
}

export async function ensureDefaultSettings() {
  const db = getDb();
  const setting = await db.setting.findUnique({ where: { key: MLM_SETTINGS_KEY } });
  if (setting) return setting;
  return db.setting.create({
    data: {
      key: MLM_SETTINGS_KEY,
      levelPercentages: DEFAULT_LEVEL_PERCENTAGES,
    },
  });
}

export async function runMlmPayoutEngine(params: {
  sourceUserId: string;
  depositAmount: number;
  note?: string;
}) {
  const db = getDb();
  const sourceUserId = params.sourceUserId;
  const depositAmount = params.depositAmount;
  const note = params.note ?? "Deposit confirmation";

  const setting = await ensureDefaultSettings();
  const levelPercentages = (setting.levelPercentages as number[]) ?? DEFAULT_LEVEL_PERCENTAGES;

  const payouts: PayoutResult[] = [];

  await db.$transaction(async (tx) => {
    await tx.transaction.create({
      data: {
        userId: sourceUserId,
        sourceUserId,
        level: 0,
        amount: new Prisma.Decimal(depositAmount.toFixed(2)),
        type: "deposit",
        note,
      },
    });

    const sourceUser = await tx.user.findUnique({
      where: { id: sourceUserId },
      select: { id: true, referredById: true },
    });
    if (!sourceUser) {
      throw new Error("Source user not found");
    }

    const chain = await loadSponsorChainIds(tx, sourceUser.referredById);

    for (let level = 1; level <= 20; level += 1) {
      const idx = level - 1;
      if (idx >= chain.length) break;
      const parentUser = await tx.user.findUnique({
        where: { id: chain[idx] },
        select: { id: true },
      });
      if (!parentUser) break;

      const pct = levelPercentages[level - 1] ?? 0;
      const amountNum = Number(((depositAmount * pct) / 100).toFixed(2));
      if (amountNum > 0) {
        await tx.user.update({
          where: { id: parentUser.id },
          data: { withdrawBalance: { increment: new Prisma.Decimal(amountNum.toFixed(2)) } } as any,
        });
        await tx.notification.create({
          data: {
            userId: parentUser.id,
            type: "commission",
            title: `L${level} Commission`,
            message: `You received ${amountNum} from ${sourceUserId}`,
          },
        });
        await tx.transaction.create({
          data: {
            userId: parentUser.id,
            sourceUserId,
            level,
            amount: new Prisma.Decimal(amountNum.toFixed(2)),
            type: "commission",
            note: `L${level} commission from ${sourceUserId}`,
          },
        });
        payouts.push({ level, beneficiaryUserId: parentUser.id, amount: amountNum });
      }
    }
  }, INTERACTIVE_TX_OPTIONS);

  return { sourceUserId, depositAmount, payouts };
}

export async function runActivationPayoutEngine(params: {
  sourceUserId: string;
  activationAmount: number;
  note?: string;
  /**
   * Admin panel activation: no debit from member wallet. By default the $10 fee goes to admin (deposit already paid uplines). With ACTIVATION_DISTRIBUTE_TO_UPLINES=true, same L1–L20 $0.50 split as deposits.
   * Confirmed Deposit row is created so admin “total deposits” matches other flows that log to Deposit.
   * Row lock + activation row prevent double commission on double-click. If activation already exists (wallet or admin),
   * only status is set to active — no second commission.
   */
  skipUserDeduction?: boolean;
}) {
  const db = getDb();
  const sourceUserId = params.sourceUserId;
  const activationAmount = params.activationAmount;
  const note = params.note ?? "Account activation";
  const skipUserDeduction = params.skipUserDeduction === true;
  const perLevel = 0.5;
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();

  const payouts: PayoutResult[] = [];
  let reactivationOnly = false;

  await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "User" WHERE id = ${sourceUserId} FOR UPDATE`,
    );
    if (!locked?.length) {
      throw new Error("User not found");
    }

    const existingActivation = await tx.transaction.findFirst({
      where: {
        userId: sourceUserId,
        sourceUserId: sourceUserId,
        type: "activation",
      },
      select: { id: true },
    });

    const userSnap = await tx.user.findUnique({
      where: { id: sourceUserId },
      select: { id: true, status: true },
    });
    if (!userSnap) {
      throw new Error("User not found");
    }

    if (skipUserDeduction) {
      if (existingActivation) {
        await tx.user.update({
          where: { id: sourceUserId },
          data: { status: "active" },
        });
        reactivationOnly = true;
        return;
      }
      if (isActivatedMemberStatus(userSnap.status)) {
        reactivationOnly = true;
        return;
      }
    } else {
      if (existingActivation) {
        throw new Error("Account already activated");
      }
      if (isActivatedMemberStatus(userSnap.status)) {
        throw new Error("Account already activated");
      }
    }

    if (!skipUserDeduction) {
      // 1. Deduct activation from main balance first, then USDT wallet (same $10 total)
      const { main: mainBal, usdt: usdtBal } = await getUserMainAndUsdtBalance(tx, sourceUserId);
      const total = Number((mainBal + usdtBal).toFixed(2));
      if (total < activationAmount) {
        throw new Error("Insufficient balance for activation");
      }
      const fromMain = Math.min(mainBal, activationAmount);
      const fromUsdt = Number((activationAmount - fromMain).toFixed(2));

      if (fromMain > 0 && fromUsdt > 0) {
        await tx.$executeRawUnsafe(
          `UPDATE "User" SET balance = COALESCE(balance,0) - $1, "usdtBalance" = COALESCE("usdtBalance",0) - $2 WHERE id = $3`,
          fromMain,
          fromUsdt,
          sourceUserId,
        );
        await tx.user.update({ where: { id: sourceUserId }, data: { status: "active" } });
      } else if (fromMain > 0) {
        await tx.user.update({
          where: { id: sourceUserId },
          data: {
            balance: { decrement: new Prisma.Decimal(fromMain.toFixed(2)) },
            status: "active",
          },
        });
      } else if (fromUsdt > 0) {
        await tx.$executeRawUnsafe(
          `UPDATE "User" SET "usdtBalance" = COALESCE("usdtBalance",0) - $1 WHERE id = $2`,
          fromUsdt,
          sourceUserId,
        );
        await tx.user.update({ where: { id: sourceUserId }, data: { status: "active" } });
      }
    } else {
      await tx.user.update({
        where: { id: sourceUserId },
        data: { status: "active" },
      });
    }

    const user = await tx.user.findUnique({
      where: { id: sourceUserId },
      select: { id: true, referredById: true, username: true, balance: true },
    });
    if (!user) {
      throw new Error("User not found after activation");
    }

    // 2. Create activation transaction
    await tx.transaction.create({
      data: {
        userId: sourceUserId,
        sourceUserId,
        level: 0,
        amount: new Prisma.Decimal(activationAmount.toFixed(2)),
        type: "activation",
        note,
      },
    });

    if (skipUserDeduction) {
      const depositTxHash = `admin-panel-activation-${sourceUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
      await tx.deposit.create({
        data: {
          userId: sourceUserId,
          chain: "BSC",
          txHash: depositTxHash,
          amount: new Prisma.Decimal(activationAmount.toFixed(2)),
          status: "confirmed",
          verifiedAt: new Date(),
        },
      });
    }

    const adminByStatus = await tx.user.findFirst({
      where: { status: "admin" },
      select: { id: true, email: true, username: true },
    });
    const adminByEmail =
      adminByStatus ??
      (await tx.user.findUnique({ where: { email: adminEmail }, select: { id: true, email: true, username: true } }));
    const adminId = adminByEmail?.id ?? null;
    if (!adminId) {
      throw new Error("Admin user not found");
    }

    const payActivationUplines = activationDistributesToUplines();

    const activationChain = await loadSponsorChainIds(tx, user.referredById);
    let remainingAmount = Number(activationAmount.toFixed(2));

    if (payActivationUplines) {
      for (let level = 1; level <= 20 && remainingAmount >= perLevel; level += 1) {
        const idx = level - 1;
        if (idx >= activationChain.length) break;
        const beneficiary = await tx.user.findUnique({
          where: { id: activationChain[idx] },
          select: { id: true },
        });
        if (!beneficiary) break;

        await tx.user.update({
          where: { id: beneficiary.id },
          data: { withdrawBalance: { increment: new Prisma.Decimal(perLevel.toFixed(2)) } } as any,
        });
        await tx.notification.create({
          data: {
            userId: beneficiary.id,
            type: "commission",
            title: `L${level} Commission`,
            message: `You received ${perLevel.toFixed(2)} from ${user.username} activation`,
          },
        });
        await tx.transaction.create({
          data: {
            userId: beneficiary.id,
            sourceUserId,
            level,
            amount: new Prisma.Decimal(perLevel.toFixed(2)),
            type: "commission",
            note: `L${level} activation commission from ${sourceUserId}`,
          },
        });
        payouts.push({ level, beneficiaryUserId: beneficiary.id, amount: perLevel });
        remainingAmount = Number((remainingAmount - perLevel).toFixed(2));
      }
    }

    if (remainingAmount > 0) {
      await tx.user.update({
        where: { id: adminId },
        data: { balance: { increment: new Prisma.Decimal(remainingAmount.toFixed(2)) } },
      });
      await tx.notification.create({
        data: {
          userId: adminId,
          type: "commission",
          title: payActivationUplines ? "Admin Activation Share" : "Activation fee (platform)",
          message: payActivationUplines
            ? `You received ${remainingAmount.toFixed(2)} from ${user.username} activation`
            : `Activation fee ${remainingAmount.toFixed(2)} from ${user.username} (upline paid on deposit)`,
        },
      });
      await tx.transaction.create({
        data: {
          userId: adminId,
          sourceUserId,
          level: 0,
          amount: new Prisma.Decimal(remainingAmount.toFixed(2)),
          type: "commission",
          note: payActivationUplines
            ? `Admin activation share from ${sourceUserId}`
            : `Activation fee to platform from ${sourceUserId}`,
        },
      });
    }
  }, INTERACTIVE_TX_OPTIONS);

  return { sourceUserId, activationAmount, payouts, reactivationOnly };
}

export async function runFixedPayoutEngineWithTx(
  tx: DbTx,
  params: {
    sourceUserId: string;
    depositAmount: number;
    note?: string;
    /**
     * When false, only records the deposit ledger row — no L1–L20 fixed payouts or admin share.
     * Used for members who are not activated yet: uplines are paid once on account activation instead.
     */
    distributeMlm?: boolean;
  },
) {
  const sourceUserId = params.sourceUserId;
  const depositAmount = params.depositAmount;
  const note = params.note ?? "Deposit confirmation";
  const distributeMlm = params.distributeMlm !== false;
  const perLevel = 0.5;
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();

  const payouts: PayoutResult[] = [];

  await tx.transaction.create({
    data: {
      userId: sourceUserId,
      sourceUserId,
      level: 0,
      amount: new Prisma.Decimal(depositAmount.toFixed(2)),
      type: "deposit",
      note,
    },
  });

  if (!distributeMlm) {
    return { sourceUserId, depositAmount, payouts };
  }

  const adminByStatus = await tx.user.findFirst({
    where: { status: "admin" },
    select: { id: true, email: true, username: true },
  });
  const adminByEmail =
    adminByStatus ??
    (await tx.user.findUnique({ where: { email: adminEmail }, select: { id: true, email: true, username: true } }));
  const adminId = adminByEmail?.id ?? null;
  if (!adminId) {
    throw new Error("Admin user not found");
  }

  const sourceUser = await tx.user.findUnique({
    where: { id: sourceUserId },
    select: { id: true, referredById: true, username: true },
  });
  if (!sourceUser) {
    throw new Error("Source user not found");
  }

  const fixedChain = await loadSponsorChainIds(tx, sourceUser.referredById);
  let remainingAmount = Number(depositAmount.toFixed(2));

  for (let level = 1; level <= 20 && remainingAmount >= perLevel; level += 1) {
    const idx = level - 1;
    if (idx >= fixedChain.length) break;
    const beneficiary = await tx.user.findUnique({
      where: { id: fixedChain[idx] },
      select: { id: true },
    });
    if (!beneficiary) break;

    await tx.user.update({
      where: { id: beneficiary.id },
      data: { balance: { increment: new Prisma.Decimal(perLevel.toFixed(2)) } },
    });
    await tx.notification.create({
      data: {
        userId: beneficiary.id,
        type: "commission",
        title: `L${level} Commission`,
        message: `You received ${perLevel.toFixed(2)} from ${sourceUser.username}`,
      },
    });
    await tx.transaction.create({
      data: {
        userId: beneficiary.id,
        sourceUserId,
        level,
        amount: new Prisma.Decimal(perLevel.toFixed(2)),
        type: "commission",
        note: `L${level} fixed payout from ${sourceUserId}`,
      },
    });
    payouts.push({ level, beneficiaryUserId: beneficiary.id, amount: perLevel });
    remainingAmount = Number((remainingAmount - perLevel).toFixed(2));
  }

  if (remainingAmount > 0) {
    await tx.user.update({
      where: { id: adminId },
      data: { balance: { increment: new Prisma.Decimal(remainingAmount.toFixed(2)) } },
    });
    await tx.notification.create({
      data: {
        userId: adminId,
        type: "commission",
        title: "Admin Deposit Share",
        message: `You received ${remainingAmount.toFixed(2)} from ${sourceUser.username}`,
      },
    });
    await tx.transaction.create({
      data: {
        userId: adminId,
        sourceUserId,
        level: 0,
        amount: new Prisma.Decimal(remainingAmount.toFixed(2)),
        type: "commission",
        note: `Admin share from ${sourceUserId}`,
      },
    });
  }

  return { sourceUserId, depositAmount, payouts };
}

export async function runFixedPayoutEngine(params: {
  sourceUserId: string;
  depositAmount: number;
  note?: string;
  distributeMlm?: boolean;
}) {
  const db = getDb();
  return db.$transaction((tx) => runFixedPayoutEngineWithTx(tx, params), INTERACTIVE_TX_OPTIONS);
}
