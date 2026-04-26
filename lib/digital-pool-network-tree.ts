import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { findCompanyRootUser } from "@/lib/company-admin";
import { getBinaryLevelsCompletedForUser, markUserPanelLevel1CompletedAtIfNeeded } from "@/lib/user-binary-level";
import { TREE_QUERY_MAX_DEPTH } from "@/lib/tree-display";
import { MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL } from "@/lib/digital-pool-network-config";

export type TeamRow = {
  id: string;
  username: string;
  email: string;
  walletAddress: string;
  referrerCode: string;
  referredById: string | null;
  createdAt: Date;
  userPanelLevel1CompletedAt: Date | null;
  depth: number;
  verified: number;
  status: string;
};

async function fetchTeamRows(db: PrismaClient, userId: string): Promise<TeamRow[]> {
  return db.$queryRaw<TeamRow[]>(Prisma.sql`
    WITH RECURSIVE team AS (
      SELECT id, username, email, "walletAddress", "referrerCode", "referredById", "createdAt", "userPanelLevel1CompletedAt", status, 0 AS depth
      FROM "User"
      WHERE id = ${userId}
      UNION ALL
      SELECT u.id, u.username, u.email, u."walletAddress", u."referrerCode", u."referredById", u."createdAt", u."userPanelLevel1CompletedAt", u.status, t.depth + 1 AS depth
      FROM "User" u
      JOIN team t ON u."referredById" = t.id
      WHERE t.depth < ${TREE_QUERY_MAX_DEPTH}
    ),
    first_deposits AS (
      SELECT "userId", MIN("createdAt") AS "firstDepositAt"
      FROM "Deposit"
      WHERE status = 'confirmed'
      GROUP BY "userId"
    ),
    first_activations AS (
      SELECT "userId", MIN("createdAt") AS "firstActivationAt"
      FROM "Transaction"
      WHERE type = 'activation'
      GROUP BY "userId"
    )
    SELECT
      t.id, t.username, t.email, t."walletAddress", t."referrerCode", t."referredById", t."createdAt", t."userPanelLevel1CompletedAt", t.depth, t.status,
      CASE
        WHEN (
          fd."firstDepositAt" IS NOT NULL
          AND fd."firstDepositAt" <= t."createdAt" + interval '24 hours'
        ) OR (
          fa."firstActivationAt" IS NOT NULL
          AND fa."firstActivationAt" <= t."createdAt" + interval '24 hours'
        ) THEN 1
        ELSE 0
      END AS verified
    FROM team t
    LEFT JOIN first_deposits fd ON fd."userId" = t.id
    LEFT JOIN first_activations fa ON fa."userId" = t.id
    ORDER BY t.depth ASC
  `);
}

async function mapBinaryLevels(db: PrismaClient, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const chunk = 20;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const levels = await Promise.all(slice.map((id) => getBinaryLevelsCompletedForUser(db, id)));
    slice.forEach((id, j) => out.set(id, levels[j] ?? 0));
  }
  return out;
}

function getUserPanelL1CompletedAtMs(row: TeamRow, rows: TeamRow[]): number {
  if (row.userPanelLevel1CompletedAt) {
    return row.userPanelLevel1CompletedAt.getTime();
  }
  const directChildren = rows
    .filter((r) => r.referredById === row.id && r.status !== "inactive")
    .sort((a, b) => {
      const ta = a.createdAt.getTime();
      const tb = b.createdAt.getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
  const secondDirect = directChildren[1];
  return (secondDirect?.createdAt ?? row.createdAt).getTime();
}

/**
 * Admin / company root ke neeche jis **direct** member ki line mein `userId` aata hai — Digital Pool usi leg ka alag tree hai.
 * Company root khud → null (koi leg nahi).
 */
export function getDigitalPoolLegRootId(
  userId: string,
  companyRootId: string,
  rowById: Map<string, TeamRow>,
): string | null {
  if (!userId || userId === companyRootId) return null;
  let currentId = userId;
  for (let i = 0; i < 10_000; i++) {
    const row = rowById.get(currentId);
    if (!row?.referredById) return null;
    if (row.referredById === companyRootId) return currentId;
    currentId = row.referredById;
  }
  return null;
}

function simulateDigitalPoolPlacement(
  qualifiedRows: TeamRow[],
  rowById: Map<string, TeamRow>,
  levelById: Map<string, number>,
  rows: TeamRow[],
  minBinaryLevel: number,
): {
  nodes: Array<Record<string, unknown>>;
  levels: Record<string, number>;
  total: number;
  poolTreeAnchorId: string;
} {
  const poolParentById = new Map<string, string | null>();
  const poolDepthById = new Map<string, number>();
  const placementIndexById = new Map<string, number>();
  const slotCountById = new Map<string, number>();
  const processedFundedOwners = new Set<string>();
  const placedIds: string[] = [];
  const entryOwnerById = new Map<string, string>();
  const fundedSlots: Array<{ id: string; ownerId: string; receiverId: string; entryNo: 1 | 2 }> = [];

  type PoolQueueEntry =
    | { kind: "real"; id: string; ownerId: string }
    | { kind: "funded"; id: string; ownerId: string; entryNo: 1 | 2 };

  const entryQueue: PoolQueueEntry[] = qualifiedRows.map((row) => ({
    kind: "real",
    id: row.id,
    ownerId: row.id,
  }));

  let cursor = 0;
  while (cursor < entryQueue.length) {
    const entry = entryQueue[cursor];
    const parentId = placedIds.find((id) => (slotCountById.get(id) ?? 0) < 3) ?? null;

    poolParentById.set(entry.id, parentId);
    poolDepthById.set(entry.id, parentId !== null ? (poolDepthById.get(parentId) ?? 0) + 1 : 0);
    slotCountById.set(entry.id, 0);
    entryOwnerById.set(entry.id, entry.ownerId);
    placedIds.push(entry.id);
    placementIndexById.set(entry.id, placedIds.length);

    if (entry.kind === "funded") {
      fundedSlots.push({
        id: entry.id,
        ownerId: entry.ownerId,
        receiverId: parentId ?? "",
        entryNo: entry.entryNo,
      });
    }

    if (parentId !== null) {
      const newCount = (slotCountById.get(parentId) ?? 0) + 1;
      slotCountById.set(parentId, newCount);

      if (newCount === 3 && !processedFundedOwners.has(parentId)) {
        processedFundedOwners.add(parentId);
        const fundedOwnerId = entryOwnerById.get(parentId) ?? parentId;
        const funded: PoolQueueEntry[] = [1, 2].map((n) => ({
          kind: "funded" as const,
          id: `__digital_pool_funded_${parentId}_${n}`,
          ownerId: fundedOwnerId,
          entryNo: n as 1 | 2,
        }));
        entryQueue.splice(cursor + 1, 0, ...funded);
      }
    }

    cursor += 1;
  }

  const levels: Record<string, number> = {};
  const nodes: Array<Record<string, unknown>> = [];
  const idsForNodes = new Set<string>(qualifiedRows.map((r) => r.id));

  for (const id of idsForNodes) {
    const row = rowById.get(id);
    if (!row) continue;
    const d = poolDepthById.get(id) ?? 0;
    const poolParent = poolParentById.get(id) ?? null;

    if (d > 0) {
      const depthKey = String(d);
      levels[depthKey] = (levels[depthKey] ?? 0) + 1;
    }

    nodes.push({
      id: row.id,
      username: row.username,
      email: row.email,
      walletAddress: row.walletAddress,
      referrerCode: row.referrerCode,
      referredById: poolParent,
      createdAt: row.createdAt,
      depth: d,
      verified: Number(row.verified) === 1,
      binaryLevelsCompleted: levelById.get(id) ?? 0,
      userPanelL1CompletedAt: row.userPanelLevel1CompletedAt ?? new Date(getUserPanelL1CompletedAtMs(row, rows)),
      poolPlacementIndex: placementIndexById.get(id) ?? 0,
      slotsFilled: slotCountById.get(id) ?? 0,
    });
  }

  for (const slot of fundedSlots) {
    const owner = rowById.get(slot.ownerId);
    nodes.push({
      id: slot.id,
      username: `${owner?.username ?? "Member"} · $100 entry ${slot.entryNo}`,
      email: "",
      walletAddress: "",
      referrerCode: "",
      referredById: slot.receiverId,
      createdAt: owner?.createdAt ?? new Date(0),
      depth: poolDepthById.get(slot.id) ?? 0,
      verified: true,
      binaryLevelsCompleted: minBinaryLevel,
      userPanelL1CompletedAt: null,
      poolPlacementIndex: placementIndexById.get(slot.id) ?? 0,
      slotsFilled: slotCountById.get(slot.id) ?? 0,
      isFundedPlaceholder: true,
      fundedOwnerId: slot.ownerId,
      fundedUsd: 100,
    });
  }

  nodes.sort((a, b) => {
    const pa = Number(a.poolPlacementIndex ?? 0);
    const pb = Number(b.poolPlacementIndex ?? 0);
    if (pa !== pb) return pa - pb;
    return String(a.id).localeCompare(String(b.id));
  });

  const total = Object.values(levels).reduce((s, n) => s + n, 0);
  return {
    nodes,
    levels,
    total,
    poolTreeAnchorId: qualifiedRows[0]?.id ?? "",
  };
}

/**
 * Cron / global reconcile: har admin leg ke liye alag tree simulate karke rewards sync karein.
 * `poolMemberId` empty ho to bhi yeh use karein (my-network empty string ab use nahi karta).
 */
export async function buildDigitalPoolNetworkAllLegsForReconcile(
  db: PrismaClient,
  minBinaryLevel: number = MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL,
): Promise<Array<Record<string, unknown>>> {
  const companyRoot = await findCompanyRootUser(db);
  if (!companyRoot) return [];

  const anchorRootId = companyRoot.id;
  const rows = await fetchTeamRows(db, anchorRootId);
  if (rows.length === 0) return [];

  const rowById = new Map<string, TeamRow>();
  for (const r of rows) {
    rowById.set(r.id, r);
  }

  const allIds = rows.map((r) => r.id);
  const levelById = await mapBinaryLevels(db, allIds);

  const qualifiedAll = rows
    .filter(
      (r) =>
        r.id !== anchorRootId &&
        r.status !== "inactive" &&
        (levelById.get(r.id) ?? 0) >= minBinaryLevel,
    )
    .sort((a, b) => {
      const qa = getUserPanelL1CompletedAtMs(a, rows);
      const qb = getUserPanelL1CompletedAtMs(b, rows);
      if (qa !== qb) return qa - qb;
      const ca = a.createdAt.getTime();
      const cb = b.createdAt.getTime();
      if (ca !== cb) return ca - cb;
      return a.id.localeCompare(b.id);
    });

  await Promise.all(
    qualifiedAll
      .filter((r) => !r.userPanelLevel1CompletedAt)
      .map((r) => markUserPanelLevel1CompletedAtIfNeeded(db, r.id, new Date(getUserPanelL1CompletedAtMs(r, rows)))),
  );

  const legRootIds = rows.filter((r) => r.referredById === anchorRootId).map((r) => r.id);
  const merged: Array<Record<string, unknown>> = [];

  for (const legId of legRootIds) {
    const qualifiedRows = qualifiedAll.filter(
      (r) => getDigitalPoolLegRootId(r.id, anchorRootId, rowById) === legId,
    );
    if (qualifiedRows.length === 0) continue;
    const { nodes } = simulateDigitalPoolPlacement(qualifiedRows, rowById, levelById, rows, minBinaryLevel);
    merged.push(...nodes);
  }

  return merged;
}

const VIEWER_DIRECT_CAP = 24;

/**
 * **Har admin leg ka alag Digital Pool tree** — doosri leg ke qualified members is tree mein nahi aate.
 *
 * Placement same: pehla qualifier us leg ka root; phir 3-wide BFS queue.
 */
export async function buildDigitalPoolNetworkResponse(
  db: PrismaClient,
  poolMemberId: string,
  minBinaryLevel: number = MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL,
): Promise<{
  nodes: Array<Record<string, unknown>>;
  levels: Record<string, number>;
  total: number;
  viewerDirectReferrals: Array<Record<string, unknown>>;
  poolTreeAnchorId: string;
  /** Company ke neeche jis direct line ka pool hai — isi leg ke members yahan dikhte hain. */
  poolLegRootId: string;
}> {
  const companyRoot = await findCompanyRootUser(db);
  if (!companyRoot) {
    return { nodes: [], levels: {}, total: 0, viewerDirectReferrals: [], poolTreeAnchorId: "", poolLegRootId: "" };
  }

  const anchorRootId = companyRoot.id;
  const rows = await fetchTeamRows(db, anchorRootId);
  if (rows.length === 0) {
    return { nodes: [], levels: {}, total: 0, viewerDirectReferrals: [], poolTreeAnchorId: "", poolLegRootId: "" };
  }

  const rowById = new Map<string, TeamRow>();
  for (const r of rows) {
    rowById.set(r.id, r);
  }

  const allIds = rows.map((r) => r.id);
  const levelById = await mapBinaryLevels(db, allIds);

  const qualifiedAll = rows
    .filter(
      (r) =>
        r.id !== anchorRootId &&
        r.status !== "inactive" &&
        (levelById.get(r.id) ?? 0) >= minBinaryLevel,
    )
    .sort((a, b) => {
      const qa = getUserPanelL1CompletedAtMs(a, rows);
      const qb = getUserPanelL1CompletedAtMs(b, rows);
      if (qa !== qb) return qa - qb;
      const ca = a.createdAt.getTime();
      const cb = b.createdAt.getTime();
      if (ca !== cb) return ca - cb;
      return a.id.localeCompare(b.id);
    });

  await Promise.all(
    qualifiedAll
      .filter((r) => !r.userPanelLevel1CompletedAt)
      .map((r) => markUserPanelLevel1CompletedAtIfNeeded(db, r.id, new Date(getUserPanelL1CompletedAtMs(r, rows)))),
  );

  const viewerRawDirectRows = rows
    .filter((r) => r.referredById === poolMemberId && r.status !== "inactive")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const viewerDirectReferrals = viewerRawDirectRows.slice(0, VIEWER_DIRECT_CAP).map((r) => ({
    id: r.id,
    username: r.username,
    createdAt: r.createdAt,
    binaryLevelsCompleted: levelById.get(r.id) ?? 0,
    rawReferralDirect: true,
  }));

  const viewerLegRoot = poolMemberId ? getDigitalPoolLegRootId(poolMemberId, anchorRootId, rowById) : null;
  if (!poolMemberId || poolMemberId === anchorRootId || !viewerLegRoot) {
    return {
      nodes: [],
      levels: {},
      total: 0,
      viewerDirectReferrals,
      poolTreeAnchorId: "",
      poolLegRootId: viewerLegRoot ?? "",
    };
  }

  const qualifiedRows = qualifiedAll.filter(
    (r) => getDigitalPoolLegRootId(r.id, anchorRootId, rowById) === viewerLegRoot,
  );

  if (qualifiedRows.length === 0) {
    return {
      nodes: [],
      levels: {},
      total: 0,
      viewerDirectReferrals,
      poolTreeAnchorId: "",
      poolLegRootId: viewerLegRoot,
    };
  }

  const { nodes, levels, total, poolTreeAnchorId } = simulateDigitalPoolPlacement(
    qualifiedRows,
    rowById,
    levelById,
    rows,
    minBinaryLevel,
  );

  return { nodes, levels, total, viewerDirectReferrals, poolTreeAnchorId, poolLegRootId: viewerLegRoot };
}
