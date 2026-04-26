import type { Prisma } from "@prisma/client";
import type { getDb } from "@/lib/db";

/**
 * Safety cap when walking the referral chain upward (each user has at most one sponsor).
 * Replaces the old fixed "10 levels" limit so deep trees still refresh every ancestor.
 */
export const TEAM_UPLINE_MAX_DEPTH = 2048;
/** Inactivity window before auto `withdraw_suspend` (no downline activation in this period). */
export const TEAM_INACTIVITY_DAYS = 10;

const TEAM_INACTIVITY_MS = TEAM_INACTIVITY_DAYS * 24 * 60 * 60 * 1000;

export const AUTO_SUSPEND_SOURCE = "auto_team_inactivity" as const;
export const MANUAL_SUSPEND_SOURCE = "manual" as const;

function inactivityCutoff(): Date {
  return new Date(Date.now() - TEAM_INACTIVITY_MS);
}

/** Seconds until `lastDownlineActivityAt + inactivity window` (0 = overdue). */
export function secondsRemainingInTeamActivityWindow(
  lastDownlineActivityAt: Date,
  now: Date = new Date(),
): number {
  const end = new Date(lastDownlineActivityAt.getTime() + TEAM_INACTIVITY_MS);
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
}

type DbLike = {
  user: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; referredById: true; status: true; withdrawSuspendSource: true };
    }) => Promise<{
      id: string;
      referredById: string | null;
      status: string;
      withdrawSuspendSource: string | null;
    } | null>;
    update: (args: { where: { id: string }; data: Prisma.UserUpdateInput }) => Promise<unknown>;
  };
};

/**
 * Call when a member activates (not on signup alone). Walks **all** upline sponsors (up to
 * {@link TEAM_UPLINE_MAX_DEPTH}): refreshes `lastDownlineActivityAt` and restores
 * `withdraw_suspend` only when `withdrawSuspendSource` was auto_team_inactivity.
 */
export async function onNewMemberRegistered(
  db: DbLike,
  newUserId: string,
): Promise<void> {
  const u = await db.user.findUnique({
    where: { id: newUserId },
    select: { id: true, referredById: true, status: true, withdrawSuspendSource: true },
  });
  if (!u || u.status === "admin") return;

  const now = new Date();
  let currentId: string | null = u.referredById;

  for (let depth = 0; depth < TEAM_UPLINE_MAX_DEPTH && currentId; depth++) {
    const parent = await db.user.findUnique({
      where: { id: currentId },
      select: { id: true, referredById: true, status: true, withdrawSuspendSource: true },
    });
    if (!parent) break;

    const data: Prisma.UserUpdateInput = {
      lastDownlineActivityAt: now,
    };

    if (
      parent.status === "withdraw_suspend" &&
      parent.withdrawSuspendSource === AUTO_SUSPEND_SOURCE
    ) {
      data.status = "active";
      data.withdrawSuspendSource = null;
    }

    await db.user.update({ where: { id: parent.id }, data });
    currentId = parent.referredById;
  }
}

// Same inactivity rule as runTeamWithdrawAutoSuspendSweep, for one user (dashboard or withdraw routes).
export async function applyAutoWithdrawSuspendIfStaleForUser(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<void> {
  const cutoff = inactivityCutoff();
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { status: true, adminRoleId: true, lastDownlineActivityAt: true },
  });
  if (!u || u.status !== "active" || u.adminRoleId != null) return;
  if (u.lastDownlineActivityAt >= cutoff) return;
  await db.user.update({
    where: { id: userId },
    data: {
      status: "withdraw_suspend",
      withdrawSuspendSource: AUTO_SUSPEND_SOURCE,
    },
  });
}

/**
 * Marks active members (non-admin) with stale team activity as auto withdraw-suspended.
 */
export async function runTeamWithdrawAutoSuspendSweep(db: ReturnType<typeof getDb>): Promise<{ updated: number }> {
  const cutoff = inactivityCutoff();

  const res = await db.user.updateMany({
    where: {
      status: "active",
      adminRoleId: null,
      lastDownlineActivityAt: { lt: cutoff },
    },
    data: {
      status: "withdraw_suspend",
      withdrawSuspendSource: AUTO_SUSPEND_SOURCE,
    },
  });

  return { updated: res.count };
}
