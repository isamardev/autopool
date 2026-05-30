import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdminSection } from "@/lib/admin-api-guard";
import { Prisma } from "@prisma/client";
import { TREE_QUERY_MAX_DEPTH } from "@/lib/tree-display";
import { isActivatedMemberStatus } from "@/lib/user-status";
import { runTeamWithdrawSuspendCycle } from "@/lib/team-withdraw-activity";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const isDigitalPool = searchParams.get("digitalPool") === "1";

    const gateUsers = await requireAdminSection("users");
    const gateWd = await requireAdminSection("withdrawals");
    const gatePay = await requireAdminSection("payments");

    // If requesting digital pool users, allow if they have users OR withdrawals OR payments permission.
    // If requesting normal users, must have users permission.
    if (isDigitalPool) {
      if (!gateUsers.ok && !gateWd.ok && !gatePay.ok) return gateUsers.response;
    } else {
      if (!gateUsers.ok) return gateUsers.response;
    }

    const db = getDb();
    /** Sync auto team withdraw_suspend in DB before listing — same rule as cron / user dashboard (admin sees status without end-user opening Withdraw). */
    await runTeamWithdrawSuspendCycle(db);

    const where: Prisma.UserWhereInput = { adminRoleId: null, status: { not: "admin" } };
    if (isDigitalPool) {
      where.digitalPoolCredential = { isNot: null };
    }

    const users = await db.user.findMany({
      // Staff: Roles tab only. Admin accounts: never list in Users tab.
      where,
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        country: true,
        balance: true,
        status: true,
        createdAt: true,
        referredById: true,
        securityCode: true,
        staffPasswordPlain: true,
        adminRoleId: true,
        digitalPoolWithdrawBalance: true,
        digitalPoolWithdrawSuspend: true,
        adminRole: { select: { id: true, name: true } },
        _count: { select: { referrals: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const withdrawMap = new Map<string, number>();
    const usdtMap = new Map<string, number>();
    const withdrawAddressMap = new Map<string, string>();
    const poolSecurityCodeMap = new Map<string, string>();
    const poolWithdrawAddressMap = new Map<string, string>();

    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      try {
        const rows = await db.$queryRaw<Array<Record<string, unknown>>>(
          Prisma.sql`SELECT id, "withdrawBalance", "usdtBalance", "permanentWithdrawAddress" FROM "User" WHERE id IN (${Prisma.join(ids)})`,
        );
        for (const r of rows) {
          const id = String(r.id);
          withdrawMap.set(id, Number(r.withdrawBalance ?? r.withdrawbalance ?? 0));
          usdtMap.set(id, Number(r.usdtBalance ?? r.usdtbalance ?? 0));
          withdrawAddressMap.set(id, String(r.permanentWithdrawAddress ?? r.permanentwithdrawaddress ?? ""));
        }
      } catch (err) {
        console.error("Failed to fetch wallet columns for users list:", err);
      }

      // Fetch Digital Pool Credential fields via Raw SQL to avoid Prisma Client drift errors
      try {
        const poolRows = await db.$queryRaw<Array<Record<string, unknown>>>(
          Prisma.sql`SELECT "userId", "securityCode", "permanentWithdrawAddress" FROM "DigitalPoolCredential" WHERE "userId" IN (${Prisma.join(ids)})`,
        );
        for (const r of poolRows) {
          const uid = String(r.userId ?? r.userid);
          poolSecurityCodeMap.set(uid, String(r.securityCode ?? r.securitycode ?? ""));
          poolWithdrawAddressMap.set(uid, String(r.permanentWithdrawAddress ?? r.permanentwithdrawaddress ?? ""));
        }
      } catch (err) {
        console.error("Failed to fetch DigitalPoolCredential via raw SQL:", err);
      }
    }

    const downlineRows = ids.length > 0 
      ? await db.$queryRaw<Array<{ rootId: string; downlineCount: bigint | number }>>(Prisma.sql`
          WITH RECURSIVE downline AS (
            SELECT u.id AS "rootId", c.id AS "nodeId", 1 AS depth
            FROM "User" u
            JOIN "User" c ON c."referredById" = u.id
            WHERE u.id IN (${Prisma.join(ids)})
            UNION ALL
            SELECT d."rootId", c.id AS "nodeId", d.depth + 1
            FROM downline d
            JOIN "User" c ON c."referredById" = d."nodeId"
            WHERE d.depth < ${TREE_QUERY_MAX_DEPTH}
          )
          SELECT "rootId", COUNT(*) AS "downlineCount"
          FROM downline
          GROUP BY "rootId"
        `)
      : [];

    const downlineMap = new Map(downlineRows.map((row) => [row.rootId, Number(row.downlineCount ?? 0)]));

    const nowMs = Date.now();
    const expiredIds: string[] = [];

    const safe = users.map((user) => {
      const createdAtMs = user.createdAt.getTime();
      const expiresAtMs = createdAtMs + 24 * 60 * 60 * 1000;
      
      const isActivated = isActivatedMemberStatus(user.status);

      let verifyStatus: string | null = null;
      let secondsLeft = 0;

      if (user.referredById && user.status !== "admin") {
        if (isActivated) {
          verifyStatus = "verified";
        } else if (nowMs < expiresAtMs) {
          verifyStatus = "unverified";
          secondsLeft = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
        } else {
          verifyStatus = "expired";
          expiredIds.push(user.id);
        }
      }

      return {
        ...user,
        balance: Number(user.balance ?? 0),
        withdrawBalance: withdrawMap.get(user.id) ?? 0,
        digitalPoolWithdrawBalance: Number(user.digitalPoolWithdrawBalance ?? 0),
        digitalPoolWithdrawSuspend: Boolean(user.digitalPoolWithdrawSuspend),
        digitalPoolSecurityCode: poolSecurityCodeMap.get(user.id) ?? "",
        digitalPoolPermanentWithdrawAddress: poolWithdrawAddressMap.get(user.id) ?? "",
        usdtBalance: usdtMap.get(user.id) ?? 0,
        permanentWithdrawAddress: withdrawAddressMap.get(user.id) ?? "",
        createdAt: user.createdAt.toISOString(),
        downlineCount: downlineMap.get(user.id) ?? 0,
        verifyStatus,
        secondsLeft,
      };
    });

    // Cleanup: Delete expired users from database as requested
    if (expiredIds.length > 0) {
      try {
        await db.$transaction([
          db.notification.deleteMany({ where: { userId: { in: expiredIds } } }),
          db.otp.deleteMany({ where: { userId: { in: expiredIds } } }),
          db.supportTicket.deleteMany({ where: { userId: { in: expiredIds } } }),
          db.transaction.deleteMany({ where: { OR: [{ userId: { in: expiredIds } }, { sourceUserId: { in: expiredIds } }] } }),
          db.deposit.deleteMany({ where: { userId: { in: expiredIds } } }),
          db.withdrawal.deleteMany({ where: { userId: { in: expiredIds } } }),
          db.user.deleteMany({ where: { id: { in: expiredIds } } }),
        ]);
        console.log(`Cleaned up ${expiredIds.length} expired users`);
      } catch (err) {
        console.error("Failed to cleanup expired users:", err);
      }
    }

    // Filter out expired users from the response list
    const filteredSafe = safe.filter(u => u.verifyStatus !== "expired");

    return NextResponse.json({ users: filteredSafe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch users";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
