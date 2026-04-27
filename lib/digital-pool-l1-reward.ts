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
 * Pool seats that have 3+ filled legs (real node: owner = node id; funded: owner = fundedOwnerId).
 * Each seat pays at most once via {@link DigitalPoolSeatReward}.
 */
function listCompletingSeats(nodes: Array<Record<string, unknown>>): Array<{ seatId: string; ownerUserId: string }> {
  const eligible = nodes.filter((n) => Number(n.slotsFilled ?? 0) >= 3);
  eligible.sort(sortPoolNodes);
  const out: Array<{ seatId: string; ownerUserId: string }> = [];
  const seen = new Set<string>();
  for (const n of eligible) {
    const isFunded = Boolean(n.isFundedPlaceholder);
    const seatId = String(n.id ?? "");
    if (!seatId || seen.has(seatId)) continue;
    seen.add(seatId);
    const ownerUserId = isFunded ? String(n.fundedOwnerId ?? "") : seatId;
    if (!ownerUserId) continue;
    if (isFunded && !n.fundedOwnerId) continue;
    out.push({ seatId, ownerUserId });
  }
  return out;
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

/**
 * Legacy payouts used only `digitalPoolRewardGrantedCount` (per owner). After introducing
 * {@link DigitalPoolSeatReward}, insert seat rows for past grants so we do not pay those seats again —
 * **no** wallet movement here.
 */
function assertDigitalPoolSeatRewardDelegate(db: PrismaClient): void {
  const d = db as unknown as { digitalPoolSeatReward?: { findMany?: unknown } };
  if (typeof d.digitalPoolSeatReward?.findMany !== "function") {
    throw new Error(
      "Prisma client missing digitalPoolSeatReward (run npm run db:generate, restart server, then npm run db:migrate:deploy).",
    );
  }
}

async function syncLegacySeatRewardRows(db: PrismaClient, nodes: Array<Record<string, unknown>>): Promise<void> {
  assertDigitalPoolSeatRewardDelegate(db);
  const seats = listCompletingSeats(nodes);
  const byOwner = new Map<string, Array<{ seatId: string; ownerUserId: string }>>();
  for (const s of seats) {
    if (!byOwner.has(s.ownerUserId)) byOwner.set(s.ownerUserId, []);
    byOwner.get(s.ownerUserId)!.push(s);
  }

  for (const [ownerId, list] of byOwner) {
    const user = await db.user.findUnique({
      where: { id: ownerId },
      select: { digitalPoolRewardGrantedCount: true },
    });
    const claimed = user?.digitalPoolRewardGrantedCount ?? 0;
    if (claimed <= 0) continue;

    const existingRows = await db.digitalPoolSeatReward.findMany({
      where: { ownerUserId: ownerId },
      select: { seatNodeId: true },
    });
    const have = new Set(existingRows.map((r) => r.seatNodeId));
    let need = claimed - have.size;
    if (need <= 0) continue;

    for (const { seatId, ownerUserId } of list) {
      if (need <= 0) break;
      if (have.has(seatId)) continue;
      const rowExists = await db.digitalPoolSeatReward.findUnique({
        where: { seatNodeId: seatId },
        select: { seatNodeId: true },
      });
      if (rowExists) {
        have.add(seatId);
        continue;
      }
      try {
        await db.digitalPoolSeatReward.create({
          data: {
            seatNodeId: seatId,
            ownerUserId,
            amount: new Prisma.Decimal(DIGITAL_POOL_L1_WITHDRAW_CREDIT_USD.toFixed(2)),
          },
        });
        have.add(seatId);
        need -= 1;
      } catch (e) {
        if (isPrismaUniqueViolation(e)) continue;
        console.error("syncLegacySeatRewardRows", ownerId, seatId, e);
      }
    }
  }
}

/**
 * $100 + 2 entries are tied to one pool **seat** (tree node). When that seat’s 3 legs fill, pay once; deeper levels
 * do not pay that seat again. New funded seats get their own first-time $100 when their 3 fill.
 * Idempotent: table `DigitalPoolSeatReward` keyed by `seatNodeId`.
 */
export async function tryGrantDigitalPoolL1RewardsForCompletedTree(
  db: PrismaClient,
  nodes: Array<Record<string, unknown>>,
  options: { maxGrantsPerRequest?: number } = {},
): Promise<{ checked: number; granted: number; newRewards: number; errors: number; completedUserIds: string[] }> {
  await syncLegacySeatRewardRows(db, nodes);

  const seats = listCompletingSeats(nodes);
  const max = Math.min(Math.max(options.maxGrantsPerRequest ?? 50, 1), 200);
  const slice = seats.slice(0, max);
  const seatIds = slice.map((s) => s.seatId);
  const alreadyRewardedSeatIds =
    seatIds.length > 0
      ? new Set(
          (
            await db.digitalPoolSeatReward.findMany({
              where: { seatNodeId: { in: seatIds } },
              select: { seatNodeId: true },
            })
          ).map((r) => r.seatNodeId),
        )
      : new Set<string>();

  let granted = 0;
  let newRewards = 0;
  let errors = 0;
  const ownersWithNew = new Set<string>();
  const credit = DIGITAL_POOL_L1_WITHDRAW_CREDIT_USD;

  for (const { seatId, ownerUserId } of slice) {
    if (alreadyRewardedSeatIds.has(seatId)) continue;
    try {
      const userOk = await db.user.count({ where: { id: ownerUserId } });
      if (!userOk) continue;

      await db.$transaction(async (tx) => {
        await tx.digitalPoolSeatReward.create({
          data: {
            seatNodeId: seatId,
            ownerUserId,
            amount: new Prisma.Decimal(credit.toFixed(2)),
          },
        });

        const user = await tx.user.findUnique({
          where: { id: ownerUserId },
          select: { digitalPoolL1RewardGrantedAt: true },
        });

        await tx.user.update({
          where: { id: ownerUserId },
          data: {
            digitalPoolWithdrawBalance: { increment: new Prisma.Decimal(credit.toFixed(2)) },
            digitalPoolRewardGrantedCount: { increment: 1 },
            ...(user?.digitalPoolL1RewardGrantedAt == null ? { digitalPoolL1RewardGrantedAt: new Date() } : {}),
          },
        });

        const seatLabel = seatId.length > 48 ? `${seatId.slice(0, 45)}…` : seatId;
        await tx.transaction.create({
          data: {
            userId: ownerUserId,
            sourceUserId: ownerUserId,
            level: 0,
            amount: new Prisma.Decimal(credit.toFixed(2)),
            type: "adjustment",
            note: `Digital Pool seat L1 complete (${seatLabel}) — $${credit} pool withdraw; 2×$100 entries via placement`,
          },
        });
      });

      granted += 1;
      newRewards += 1;
      ownersWithNew.add(ownerUserId);
      console.log(`[DigitalPool] Seat reward $${credit} → owner ${ownerUserId} seat ${seatId}`);
    } catch (e) {
      if (isPrismaUniqueViolation(e)) continue;
      console.error(`tryGrantDigitalPoolL1RewardsForCompletedTree seat ${seatId}:`, e);
      errors += 1;
    }
  }

  return {
    checked: slice.length,
    granted,
    newRewards,
    errors,
    completedUserIds: [...ownersWithNew],
  };
}
