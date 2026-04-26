import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

/** Portion of the $300 Digital Pool L1 package credited to the separate pool withdraw wallet. */
export const DIGITAL_POOL_L1_WITHDRAW_CREDIT_USD = 100;

export type DigitalPoolL1RewardResult = {
  granted: boolean;
  alreadyGranted: boolean;
  /** Qualified pool-tree legs (parent = viewer in pool tree). */
  eligibleLegs?: number;
  /** DB direct referrals (viewer’s line) with binary / plan L1+ — alternate L1 completion rule. */
  rawDirectQualified?: number;
  error?: string;
};

function countEligibleDirectPoolLegs(nodes: Array<Record<string, unknown>>, poolParentId: string): number {
  const vid = String(poolParentId);
  return nodes.filter(
    (n) =>
      String(n.referredById ?? "") === vid &&
      (Number(n.binaryLevelsCompleted ?? 0) >= 1 || Boolean(n.isFundedPlaceholder)),
  ).length;
}

function sortPoolNodes(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const pa = Number(a.poolPlacementIndex ?? 0);
  const pb = Number(b.poolPlacementIndex ?? 0);
  if (pa !== pb) return pa - pb;
  return String(a.id).localeCompare(String(b.id));
}

function directPoolChildren(nodes: Array<Record<string, unknown>>, poolParentId: string): Array<Record<string, unknown>> {
  const vid = String(poolParentId);
  return nodes
    .filter((n) => String(n.referredById ?? "") === vid && Number(n.binaryLevelsCompleted ?? 0) >= 1)
    .slice()
    .sort(sortPoolNodes);
}

function fundedEntryReceiverForCompletedOwner(
  nodes: Array<Record<string, unknown>>,
  ownerId: string,
): Record<string, unknown> | null {
  const ordered = nodes.slice().sort(sortPoolNodes);
  const owner = ordered.find((n) => String(n.id ?? "") === String(ownerId));
  if (!owner) return null;

  const idx = ordered.findIndex((n) => String(n.id ?? "") === String(ownerId));
  if (idx < 0) return null;
  return (
    ordered[idx + 1] ??
    directPoolChildren(nodes, ownerId)[0] ??
    null
  );
}

/**
 * Funded re-entries are real pool slots for the next branch:
 * they go to the next member in global pool placement order (level-wise, left-to-right):
 * root → Position 1 → Position 2 → Position 3 → next level's left-most member → ...
 */
function computeCascadedPoolSlotCounts(nodes: Array<Record<string, unknown>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const id = String(n.id ?? "");
    if (!id || Boolean(n.isFundedPlaceholder)) continue;
    counts.set(id, countEligibleDirectPoolLegs(nodes, id));
  }
  return counts;
}

export function getDigitalPoolCascadedSlotSummary(
  nodes: Array<Record<string, unknown>>,
): Array<{ id: string; username: string; slots: number; completed: boolean }> {
  const counts = computeCascadedPoolSlotCounts(nodes);
  return nodes
    .slice()
    .sort(sortPoolNodes)
    .map((n) => {
      const id = String(n.id ?? "");
      const slots = counts.get(id) ?? 0;
      return {
        id,
        username: String(n.username ?? ""),
        slots,
        completed: slots >= 3,
      };
    });
}

/**
 * Qualified pool-tree children whose `referredById` (pool parent) equals this user — works for one global pool tree
 * (root = company) because each node’s `referredById` is the pool parent, not always depth‑0.
 */
export function getDigitalPoolL1EligibleLegCount(
  nodes: Array<Record<string, unknown>>,
  poolParentUserId: string,
): number {
  return computeCascadedPoolSlotCounts(nodes).get(String(poolParentUserId)) ?? 0;
}

/** Members in the shared Digital Pool tree whose own pool L1 is complete (3 direct pool children). */
export function getDigitalPoolL1CompletedUserIds(nodes: Array<Record<string, unknown>>): string[] {
  const cascadedCounts = computeCascadedPoolSlotCounts(nodes);
  return nodes
    .filter((n) => {
      const id = String(n.id ?? "");
      return id.length > 0 && !Boolean(n.isFundedPlaceholder) && (cascadedCounts.get(id) ?? 0) >= 3;
    })
    .sort(sortPoolNodes)
    .map((n) => String(n.id));
}

export function getPositionOneCascadeUserIds(nodes: Array<Record<string, unknown>>): string[] {
  const out = new Set<string>();
  for (const owner of nodes.slice().sort(sortPoolNodes)) {
    const ownerId = String(owner.id ?? "");
    if (Boolean(owner.isFundedPlaceholder)) continue;
    if (!ownerId || countEligibleDirectPoolLegs(nodes, ownerId) < 3) continue;
    const receiver = fundedEntryReceiverForCompletedOwner(nodes, ownerId);
    const receiverId = receiver?.id ? String(receiver.id) : "";
    if (!receiverId) continue;
    if (countEligibleDirectPoolLegs(nodes, receiverId) + 2 >= 3) {
      out.add(receiverId);
    }
  }
  return [...out];
}

/** Count of viewer’s direct DB referrals that already have plan / binary L1+ (from `viewerDirectReferrals`). */
export function countQualifiedRawDirectReferrals(
  viewerDirectReferrals: Array<{ binaryLevelsCompleted?: unknown }> | undefined,
): number {
  if (!viewerDirectReferrals?.length) return 0;
  return viewerDirectReferrals.filter((r) => Number(r.binaryLevelsCompleted ?? 0) >= 1).length;
}

/** L1 complete if 3+ pool-tree legs OR 3+ qualified direct referrals OR reward already stored. */
export function viewerMeetsDigitalPoolL1CompletionRule(args: {
  nodes: Array<Record<string, unknown>>;
  sessionUserId: string;
  viewerDirectReferrals?: Array<{ binaryLevelsCompleted?: unknown }>;
  digitalPoolL1RewardGrantedAt: Date | null | undefined;
}): { meets: boolean; poolLegs: number; rawDirectQualified: number } {
  const poolLegs = getDigitalPoolL1EligibleLegCount(args.nodes, args.sessionUserId);
  const rawDirectQualified = countQualifiedRawDirectReferrals(args.viewerDirectReferrals);
  const meets =
    poolLegs >= 3 ||
    rawDirectQualified >= 3 ||
    args.digitalPoolL1RewardGrantedAt != null;
  return { meets, poolLegs, rawDirectQualified };
}

/**
 * When the viewer meets Digital Pool L1 (3 pool legs or 3 qualified directs), credit {@link DIGITAL_POOL_L1_WITHDRAW_CREDIT_USD}
 * once to `digitalPoolWithdrawBalance`. Idempotent via `digitalPoolL1RewardGrantedAt` (atomic `updateMany`).
 */
export async function tryGrantDigitalPoolL1Reward(
  db: PrismaClient,
  userId: string,
  nodes: Array<Record<string, unknown>>,
  viewerDirectReferrals?: Array<{ binaryLevelsCompleted?: unknown }>,
): Promise<DigitalPoolL1RewardResult> {
  const poolLegs = getDigitalPoolL1EligibleLegCount(nodes, userId);
  const rawDirectQualified = countQualifiedRawDirectReferrals(viewerDirectReferrals);

  try {
    if (poolLegs < 3 && rawDirectQualified < 3) {
      return { granted: false, alreadyGranted: false, eligibleLegs: poolLegs, rawDirectQualified };
    }

    const userExists = await db.user.count({ where: { id: userId } });
    if (!userExists) {
      return { granted: false, alreadyGranted: false, eligibleLegs: poolLegs, rawDirectQualified };
    }

    const credit = DIGITAL_POOL_L1_WITHDRAW_CREDIT_USD;

    const txResult = await db.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          digitalPoolL1RewardGrantedAt: null,
        },
        data: {
          digitalPoolWithdrawBalance: { increment: new Prisma.Decimal(credit.toFixed(2)) },
          digitalPoolL1RewardGrantedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        return { granted: false as const, alreadyGranted: true as const };
      }

      await tx.transaction.create({
        data: {
          userId,
          sourceUserId: userId,
          level: 0,
          amount: new Prisma.Decimal(credit.toFixed(2)),
          type: "adjustment",
          note: `Digital Pool L1 complete — ${credit} USDT pool withdraw wallet ($300 package: ${credit} withdraw + $200 as 2×$100 entries under Position 1)`,
        },
      });

      return { granted: true as const, alreadyGranted: false as const };
    });

    return { ...txResult, eligibleLegs: poolLegs, rawDirectQualified };
  } catch (e) {
    console.error("tryGrantDigitalPoolL1Reward:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { granted: false, alreadyGranted: false, eligibleLegs: poolLegs, rawDirectQualified, error: msg };
  }
}

/**
 * Compute how many completed positions each real user owns across the entire tree.
 * A "completion" = a node (real or funded) whose slotsFilled >= 3.
 * For funded entries, the reward goes to fundedOwnerId (the real user behind them).
 */
function computeCompletionsByOwner(nodes: Array<Record<string, unknown>>): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of nodes) {
    const filled = Number(n.slotsFilled ?? 0);
    if (filled < 3) continue;
    const isFunded = Boolean(n.isFundedPlaceholder);
    const ownerId = isFunded ? String(n.fundedOwnerId ?? n.id ?? "") : String(n.id ?? "");
    if (!ownerId || isFunded && !n.fundedOwnerId) continue;
    // Skip funded placeholders as owners — only real user IDs
    if (isFunded && !n.fundedOwnerId) continue;
    map.set(ownerId, (map.get(ownerId) ?? 0) + 1);
  }
  return map;
}

/**
 * On each pool-network load, reconcile rewards for ALL completed nodes (real positions + funded entries).
 * Each completed position grants $100 to its real owner — tracked by digitalPoolRewardGrantedCount.
 * Idempotent: only grants the delta (completions − already granted count).
 */
export async function tryGrantDigitalPoolL1RewardsForCompletedTree(
  db: PrismaClient,
  nodes: Array<Record<string, unknown>>,
  options: { maxGrantsPerRequest?: number } = {},
): Promise<{ checked: number; granted: number; newRewards: number; errors: number; completedUserIds: string[] }> {
  const completionsByOwner = computeCompletionsByOwner(nodes);
  const ownerIds = [...completionsByOwner.keys()];
  const max = Math.min(Math.max(options.maxGrantsPerRequest ?? 50, 1), 200);
  let granted = 0;
  let newRewards = 0;
  let errors = 0;
  const completedUserIds: string[] = [];

  for (const ownerId of ownerIds.slice(0, max)) {
    const totalCompletions = completionsByOwner.get(ownerId) ?? 0;
    if (totalCompletions === 0) continue;

    try {
      const user = await db.user.findUnique({
        where: { id: ownerId },
        select: { digitalPoolRewardGrantedCount: true, digitalPoolL1RewardGrantedAt: true },
      });
      if (!user) continue;

      const alreadyGranted = user.digitalPoolRewardGrantedCount ?? 0;
      const delta = totalCompletions - alreadyGranted;
      if (delta <= 0) {
        completedUserIds.push(ownerId);
        continue;
      }

      const credit = DIGITAL_POOL_L1_WITHDRAW_CREDIT_USD * delta;

      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: ownerId },
          data: {
            digitalPoolWithdrawBalance: { increment: new Prisma.Decimal(credit.toFixed(2)) },
            digitalPoolRewardGrantedCount: { increment: delta },
            // Keep backward-compat timestamp for first reward
            ...(user.digitalPoolL1RewardGrantedAt == null ? { digitalPoolL1RewardGrantedAt: new Date() } : {}),
          },
        });

        await tx.transaction.create({
          data: {
            userId: ownerId,
            sourceUserId: ownerId,
            level: 0,
            amount: new Prisma.Decimal(credit.toFixed(2)),
            type: "adjustment",
            note: `Digital Pool ${delta} position(s) complete — ${delta}×$${DIGITAL_POOL_L1_WITHDRAW_CREDIT_USD} = $${credit} pool withdraw wallet credit`,
          },
        });
      });

      granted += 1;
      newRewards += delta;
      completedUserIds.push(ownerId);
      console.log(`[DigitalPool] Granted $${credit} to ${ownerId} — ${delta} new completion(s), total ${totalCompletions}`);
    } catch (e) {
      console.error(`tryGrantDigitalPoolL1RewardsForCompletedTree (${ownerId}):`, e);
      errors += 1;
    }
  }

  return { checked: Math.min(ownerIds.length, max), granted, newRewards, errors, completedUserIds };
}
