import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { requireAdminSection } from "@/lib/admin-api-guard";
import { isActivatedMemberStatus } from "@/lib/user-status";
import { getAdminStatsDayWindow } from "@/lib/admin-stats-day";
import {
  expectedAdminActivationCreditUsd,
  getSponsorChainIdsFromReferredById,
  isActivationUplineSplitEnabled,
} from "@/lib/mlm-logic";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();

export async function GET() {
  // Default structure to return in case of errors
  const defaultData = {
    totalUsers: 0,
    nonAdminCount: 0,
    totalDeposits: 0,
    sumCommissionsLifetime: 0,
    systemBalance: 0,
    totalWalletBalances: 0,
    availableBalance: 0,
    adminWalletTotal: 0,
    todayEarning: 0,
    todayCommissionsTotal: 0,
    todayCommissionToAdmin: 0,
    commissionToMembersLifetime: 0,
    commissionToMembersToday: 0,
    adminLedgerCommissionsLifetime: 0,
    adminCommissionWallet: 0,
    statsDay: { timeZone: "UTC", label: "UTC calendar day" },
    allUserWallet: 0,
    allUserWithdraw: 0,
    platformFeePool: 0,
    charityTotal: 0,
    debug: { error: "Initial state or global error" },
  };

  try {
    const gate = await requireAdminSection("overview");
    if (!gate.ok) return gate.response;

    const db = getDb();
    const dayWindow = getAdminStatsDayWindow();

    const loadAllUsers = async (): Promise<any[]> => {
      try {
        return await db.$queryRawUnsafe<any[]>(
          `SELECT id, status, balance, COALESCE("withdrawBalance", 0) AS "withdrawBalance", COALESCE("usdtBalance", 0) AS "usdtBalance", email FROM "User"`,
        );
      } catch (e: any) {
        console.error("Stats API: raw query for users failed", e.message);
        try {
          return await db.$queryRawUnsafe<any[]>(
            `SELECT id, status, balance, COALESCE("withdrawBalance", 0) AS "withdrawBalance", email FROM "User"`,
          );
        } catch (err2: any) {
          console.error("Stats API: fallback user query failed", err2.message);
          try {
            return await db.$queryRawUnsafe<any[]>(`SELECT id, status, balance, email FROM "User"`);
          } catch (err3: any) {
            console.error("Stats API: final fallback failed", err3.message);
            return [];
          }
        }
      }
    };

    const [allUsers, depAgg, wdAgg, fund] = await Promise.all([
      loadAllUsers(),
      db.deposit
        .aggregate({
          where: { status: "confirmed" },
          _sum: { amount: true },
        })
        .catch((e: unknown) => {
          console.error("Stats API: deposit table aggregate failed", e);
          return { _sum: { amount: null } };
        }),
      db.withdrawal
        .aggregate({
          where: {
            status: "approved",
            user: { status: { not: "admin" } },
          },
          _sum: { amount: true },
        })
        .catch((e: unknown) => {
          console.error("Stats API: withdrawal aggregate failed", e);
          return { _sum: { amount: null } };
        }),
      db.platformFund.findUnique({ where: { id: "default" } }).catch((e: unknown) => {
        console.error("Stats API: platform fund failed", e);
        return null;
      }),
    ]);

    const totalDeposits = Number(depAgg._sum.amount ?? 0);
    const allUserWithdraw = Number(wdAgg._sum.amount ?? 0);
    let platformFeePool = 0;
    let charityTotal = 0;
    if (fund) {
      platformFeePool = Number(fund.feePoolTotal ?? 0);
      charityTotal = Number(fund.charityTotal ?? 0);
    }

    // Process Users Data (include usdtBalance in wallet totals)
    let nonAdminCount = 0;
    let activeNonAdminCount = 0;
    let totalBal = 0;
    let totalWithdraw = 0;
    let totalUsdt = 0;
    let adminBalance = 0;
    let adminWithdraw = 0;
    let adminUsdt = 0;
    const adminIds: string[] = [];

    for (const u of allUsers) {
      const is_admin = u.status === "admin" || u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

      const b = Number(u.balance || 0);
      const w = Number(u.withdrawBalance ?? u.withdrawbalance ?? 0);
      const usdt = Number(u.usdtBalance ?? u.usdtbalance ?? 0);

      if (is_admin) {
        adminBalance += b;
        adminWithdraw += w;
        adminUsdt += usdt;
        adminIds.push(u.id);
      } else {
        nonAdminCount++;
        if (isActivatedMemberStatus(u.status)) {
          activeNonAdminCount++;
        }
        totalBal += b;
        totalWithdraw += w;
        totalUsdt += usdt;
      }
    }

    /** L1–L20 upline rows only (excludes level 0 platform/admin share so totals match MLM logic). */
    const mlmCommissionWhere = { type: "commission" as const, level: { gt: 0 } };
    const mlmCommissionTodayWhere = {
      ...mlmCommissionWhere,
      createdAt: { gte: dayWindow.start, lt: dayWindow.endExclusive },
    };
    /**
     * Only rows created by `runActivationPayoutEngine` — matches exact note shapes (not generic "activation" substring).
     */
    const adminActivationCommissionWhere: Prisma.TransactionWhereInput | null =
      adminIds.length > 0
        ? {
            userId: { in: adminIds },
            type: "commission",
            OR: [
              { note: { startsWith: "Activation fee to platform from" } },
              { note: { startsWith: "Admin activation share from" } },
              {
                AND: [
                  { note: { startsWith: "L" } },
                  { note: { contains: "activation commission from", mode: "insensitive" } },
                ],
              },
            ],
          }
        : null;
    const membersMlmWhere =
      adminIds.length > 0
        ? { ...mlmCommissionWhere, userId: { notIn: adminIds } }
        : mlmCommissionWhere;
    const membersMlmTodayWhere = {
      ...membersMlmWhere,
      createdAt: { gte: dayWindow.start, lt: dayWindow.endExclusive },
    };

    const failSum = (label: string) => (e: unknown) => {
      console.error(`Stats API: ${label}`, e);
      return { _sum: { amount: null } };
    };

    const [
      mlmLifeAgg,
      mlmTodayAgg,
      memLifeAgg,
      memTodayAgg,
      adminTodayAgg,
      adminLifeAgg,
      adminDepShareAgg,
    ] = await Promise.all([
      db.transaction
        .aggregate({ where: mlmCommissionWhere, _sum: { amount: true } })
        .catch(failSum("lifetime MLM (L1–20) commissions")),
      db.transaction
        .aggregate({ where: mlmCommissionTodayWhere, _sum: { amount: true } })
        .catch(failSum("today MLM (L1–20) commissions")),
      db.transaction
        .aggregate({ where: membersMlmWhere, _sum: { amount: true } })
        .catch(failSum("lifetime MLM to non-admin recipients")),
      db.transaction
        .aggregate({ where: membersMlmTodayWhere, _sum: { amount: true } })
        .catch(failSum("today MLM to non-admin recipients")),
      adminActivationCommissionWhere
        ? db.transaction
            .aggregate({
              where: {
                ...adminActivationCommissionWhere,
                createdAt: { gte: dayWindow.start, lt: dayWindow.endExclusive },
              },
              _sum: { amount: true },
            })
            .catch(failSum("today activation commissions to admin"))
        : Promise.resolve({ _sum: { amount: null } }),
      adminActivationCommissionWhere
        ? db.transaction
            .aggregate({
              where: adminActivationCommissionWhere,
              _sum: { amount: true },
            })
            .catch(failSum("lifetime activation commissions to admin"))
        : Promise.resolve({ _sum: { amount: null } }),
      adminIds.length > 0
        ? db.transaction
            .aggregate({
              where: {
                userId: { in: adminIds },
                type: "commission",
                OR: [
                  { note: { startsWith: "Admin share from" } },
                  {
                    AND: [
                      { note: { contains: "fixed payout from" } },
                      { NOT: { note: { contains: "activation", mode: "insensitive" } } },
                    ],
                  },
                ],
              },
              _sum: { amount: true },
            })
            .catch(failSum("lifetime deposit MLM credits to admin (overview wallet adjustment)"))
        : Promise.resolve({ _sum: { amount: null } }),
    ]);

    const sumCommissionsLifetime = Number(mlmLifeAgg._sum.amount ?? 0);
    const todayCommissionsTotal = Number(mlmTodayAgg._sum.amount ?? 0);
    const commissionToMembersLifetime = Number(Number(memLifeAgg._sum.amount ?? 0).toFixed(2));
    const commissionToMembersToday = Number(Number(memTodayAgg._sum.amount ?? 0).toFixed(2));
    const activationCommissionActualToday = Number(adminTodayAgg._sum.amount ?? 0);
    const activationCommissionActualLifetime = Number(adminLifeAgg._sum.amount ?? 0);

    const splitOn = isActivationUplineSplitEnabled();
    const activationRows = await db.transaction.findMany({
      where: { type: "activation" },
      select: { userId: true, createdAt: true },
    });
    const uniqueActivatorIds = [...new Set(activationRows.map((r) => r.userId))];
    const activatorUsers =
      uniqueActivatorIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: uniqueActivatorIds } },
            select: { id: true, referredById: true },
          })
        : [];
    const referredByForActivator = new Map(activatorUsers.map((u) => [u.id, u.referredById]));

    const chainMemo = new Map<string | null, string[]>();
    const sponsorChain = async (ref: string | null) => {
      if (chainMemo.has(ref)) return chainMemo.get(ref)!;
      const c = await getSponsorChainIdsFromReferredById(ref);
      chainMemo.set(ref, c);
      return c;
    };

    let activationAdminComputedLifetime = 0;
    for (const uid of uniqueActivatorIds) {
      const ref = referredByForActivator.get(uid) ?? null;
      const chain = await sponsorChain(ref);
      activationAdminComputedLifetime += expectedAdminActivationCreditUsd(chain, adminIds, splitOn);
    }
    activationAdminComputedLifetime = Number(activationAdminComputedLifetime.toFixed(2));

    const todayActivatorIds = new Set(
      activationRows
        .filter((r) => r.createdAt >= dayWindow.start && r.createdAt < dayWindow.endExclusive)
        .map((r) => r.userId),
    );
    let activationAdminComputedToday = 0;
    for (const uid of todayActivatorIds) {
      const ref = referredByForActivator.get(uid) ?? null;
      const chain = await sponsorChain(ref);
      activationAdminComputedToday += expectedAdminActivationCreditUsd(chain, adminIds, splitOn);
    }
    activationAdminComputedToday = Number(activationAdminComputedToday.toFixed(2));

    /** Cards use chain-based expected admin share (aligns with $10 / $9.5 / …); ledger sums kept in debug. */
    const todayCommissionToAdmin = activationAdminComputedToday;
    const adminLedgerCommissionsLifetime = activationAdminComputedLifetime;

    const activationDeltaLifetime = Number(
      (activationAdminComputedLifetime - activationCommissionActualLifetime).toFixed(2),
    );

    /** Per activating member: ledger sums (actual DB). */
    let activationCommissionToAdminBySource: { sourceUserId: string; total: number }[] = [];
    if (adminActivationCommissionWhere) {
      try {
        const bySrc = await db.transaction.groupBy({
          by: ["sourceUserId"],
          where: adminActivationCommissionWhere,
          _sum: { amount: true },
        });
        activationCommissionToAdminBySource = bySrc
          .map((r) => ({
            sourceUserId: r.sourceUserId,
            total: Number(Number(r._sum.amount ?? 0).toFixed(2)),
          }))
          .sort((a, b) => b.total - a.total);
      } catch (e) {
        console.error("Stats API: activation commission groupBy failed", e);
      }
    }

    const allUserWalletSum = totalBal + totalWithdraw + totalUsdt;
    const adminWalletSum = adminBalance + adminWithdraw + adminUsdt;
    /** Sum of deposit fixed-payout commissions to admin (remainder + L1–L20 `fixed payout`). */
    const adminDepositShareLifetime = Number(adminDepShareAgg._sum.amount ?? 0);
    /** Reconcile on-chain balances when ledger activation total differs from sponsor-chain expectation. */
    const adminWalletTotalCombined = Math.max(
      0,
      Number(
        (
          adminWalletSum -
          adminDepositShareLifetime +
          activationDeltaLifetime +
          platformFeePool +
          charityTotal
        ).toFixed(2),
      ),
    );

    const finalData = {
      totalUsers: activeNonAdminCount,
      nonAdminCount,
      totalDeposits,
      sumCommissionsLifetime: Number(sumCommissionsLifetime.toFixed(2)),
      commissionToMembersLifetime,
      adminLedgerCommissionsLifetime: Number(adminLedgerCommissionsLifetime.toFixed(2)),
      commissionToMembersToday,
      statsDay: {
        timeZone: dayWindow.timeZone,
        label: dayWindow.label,
        startIso: dayWindow.start.toISOString(),
        endExclusiveIso: dayWindow.endExclusive.toISOString(),
      },
      totalWalletBalances: Number((allUserWalletSum + adminWalletTotalCombined).toFixed(2)),
      adminWalletTotal: adminWalletTotalCombined,
      todayEarning: Number(todayCommissionsTotal.toFixed(2)),
      todayCommissionsTotal: Number(todayCommissionsTotal.toFixed(2)),
      todayCommissionToAdmin: Number(todayCommissionToAdmin.toFixed(2)),
      availableBalance: adminWalletTotalCombined,
      adminCommissionWallet: adminWalletTotalCombined,
      systemBalance: Number((allUserWalletSum + adminWalletTotalCombined).toFixed(2)),
      allUserWallet: Number(allUserWalletSum.toFixed(2)),
      allUserWithdraw: Number(allUserWithdraw.toFixed(2)),
      platformFeePool: Number(platformFeePool.toFixed(2)),
      charityTotal: Number(charityTotal.toFixed(2)),
      debug: {
        totalBal,
        totalWithdraw,
        totalUsdt,
        adminBalance,
        adminWithdraw,
        adminUsdt,
        adminWalletSumRaw: Number(adminWalletSum.toFixed(2)),
        adminWalletOverviewExDepositMlm: Math.max(
          0,
          Number((adminWalletSum - adminDepositShareLifetime).toFixed(2)),
        ),
        adminDepositMlmToAdminLifetime: Number(adminDepositShareLifetime.toFixed(2)),
        activationUplineSplitEnabled: splitOn,
        activationCommissionActualLifetime,
        activationCommissionActualToday,
        activationDeltaLifetime,
        activationAdminComputedLifetime,
        activationAdminComputedToday,
        activationCommissionToAdminBySource,
        userCount: allUsers.length,
        nonAdminCount,
        activeNonAdminCount,
      },
    };

    return NextResponse.json(finalData);
  } catch (error) {
    console.error("Stats API: Global Error", error);
    return NextResponse.json(defaultData); // Always return valid structure
  }
}
