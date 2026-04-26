import type { PrismaClient } from "@prisma/client";
import { isActivatedMemberStatus } from "@/lib/user-status";

type Db = Pick<PrismaClient, "deposit" | "transaction" | "user">;

/**
 * Non-admin referrers must have proven funds/activation. Confirmed deposits always qualify.
 * Normal account activation (member-paid $10) only creates `Transaction.type = activation`, not always a `Deposit` row;
 * P2P credits also do not create `Deposit`. Without this, P2P+activate users would always fail signup checks.
 *
 * `referrerStatus`: if already loaded, avoids extra query. **Activated member status** (`active` / `withdraw_suspend`)
 * counts as verified on live DB when legacy rows are missing — no DB writes.
 */
export async function isUserVerifiedAsReferrer(
  db: Db,
  userId: string,
  referrerStatus?: string | null,
): Promise<boolean> {
  if (referrerStatus != null && isActivatedMemberStatus(referrerStatus)) {
    return true;
  }

  const hasDeposit = await db.deposit.findFirst({
    where: { userId, status: "confirmed" },
    select: { id: true },
  });
  if (hasDeposit) return true;

  const hasActivation = await db.transaction.findFirst({
    where: { userId, sourceUserId: userId, type: "activation" },
    select: { id: true },
  });
  if (hasActivation) return true;

  if (referrerStatus == null) {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (u?.status && isActivatedMemberStatus(u.status)) return true;
  }

  return false;
}

/** For direct-referral quota: child "proved" within 24h if deposit in window or activation in window. */
export async function childMetReferralWindowVerification(
  db: Db,
  childUserId: string,
  windowEnd: Date,
): Promise<boolean> {
  const dep = await db.deposit.findFirst({
    where: {
      userId: childUserId,
      status: "confirmed",
      createdAt: { lte: windowEnd },
    },
    select: { id: true },
  });
  if (dep) return true;

  const act = await db.transaction.findFirst({
    where: {
      userId: childUserId,
      sourceUserId: childUserId,
      type: "activation",
      createdAt: { lte: windowEnd },
    },
    select: { id: true },
  });
  return !!act;
}
