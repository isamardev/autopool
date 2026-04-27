import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL } from "@/lib/digital-pool-network-config";
import {
  buildDigitalPoolCardDeriveOnly,
  deriveDigitalPoolPassword,
  DIGITAL_POOL_LOGIN_PATH,
  generateRandomPoolPassword,
  type DigitalPoolSystemPayload,
} from "@/lib/digital-pool-credentials";
import {
  buildDigitalPoolNetworkAllLegsForReconcile,
  buildDigitalPoolNetworkResponse,
} from "@/lib/digital-pool-network-tree";
import { tryGrantDigitalPoolL1RewardsForCompletedTree } from "@/lib/digital-pool-l1-reward";
import { getBinaryLevelsCompletedForUser } from "@/lib/user-binary-level";

const BCRYPT_ROUNDS = 10;

function hasDigitalPoolDelegate(db: PrismaClient): boolean {
  return typeof db.digitalPoolCredential?.findUnique === "function";
}

/** Create or update row only (caller must ensure level >= min). No derive-only fallback. */
export async function persistDigitalPoolCredentialToDb(
  db: PrismaClient,
  input: { userId: string; username: string; email: string },
): Promise<void> {
  const existing = await db.digitalPoolCredential.findUnique({
    where: { userId: input.userId },
  });

  if (!existing) {
    const plain = deriveDigitalPoolPassword(input.userId) ?? generateRandomPoolPassword();
    const passwordHash = bcrypt.hashSync(plain, BCRYPT_ROUNDS);
    await db.digitalPoolCredential.create({
      data: {
        userId: input.userId,
        username: input.username,
        email: input.email,
        passwordHash,
        passwordPlain: plain,
      },
    });
    return;
  }

  if (existing.username !== input.username || existing.email !== input.email) {
    await db.digitalPoolCredential.update({
      where: { userId: input.userId },
      data: { username: input.username, email: input.email },
    });
  }
}

/**
 * When the user first reaches `minCompletedLevel`, creates `DigitalPoolCredential` with a fixed password in DB.
 * First-time plain text prefers the legacy HMAC-derived password (same as old card) when secrets exist; otherwise random.
 * Username/email are kept in sync with `User` on each dashboard load.
 */
export async function ensureDigitalPoolCredentialAndPayload(
  db: PrismaClient,
  input: {
    userId: string;
    username: string;
    email: string;
    currentLevel: number;
    minCompletedLevel: number;
  },
): Promise<DigitalPoolSystemPayload | null> {
  if (input.currentLevel < input.minCompletedLevel) {
    return null;
  }

  if (!hasDigitalPoolDelegate(db)) {
    console.warn(
      "[digital-pool] Prisma client missing `digitalPoolCredential` — run `npm run db:generate`, restart `npm run dev`, then `npm run db:migrate:deploy`. Using derive-only card for now.",
    );
    return buildDigitalPoolCardDeriveOnly(input);
  }

  try {
    await persistDigitalPoolCredentialToDb(db, {
      userId: input.userId,
      username: input.username,
      email: input.email,
    });

    const row = await db.digitalPoolCredential.findUniqueOrThrow({
      where: { userId: input.userId },
    });

    return {
      title: "Digital Pool system",
      url: DIGITAL_POOL_LOGIN_PATH,
      username: row.username,
      email: row.email,
      password: row.passwordPlain,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const missingTable =
      (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") ||
      /DigitalPoolCredential|relation.*does not exist/i.test(msg);
    if (missingTable) {
      console.warn(
        "[digital-pool] DigitalPoolCredential table missing — run `npm run db:migrate:deploy`. Using derive-only card until then.",
      );
      return buildDigitalPoolCardDeriveOnly(input);
    }
    throw e;
  }
}

/**
 * When team shape / active membership changes, (re)create pool credentials for one user if they now meet
 * {@link MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL} (today L1; raise threshold later in network config).
 * Does **not** fall back to derive-only — DB row is required for this path.
 */
export async function syncDigitalPoolCredentialIfEligible(db: PrismaClient, userId: string): Promise<void> {
  if (!hasDigitalPoolDelegate(db)) {
    console.error(
      "[digital-pool] sync skipped: Prisma client missing `digitalPoolCredential` — run `npm run db:generate` and restart the server.",
    );
    return;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { username: true, email: true },
  });
  if (!user) return;

  const currentLevel = await getBinaryLevelsCompletedForUser(db, userId);
  if (currentLevel < MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL) {
    return;
  }

  await persistDigitalPoolCredentialToDb(db, {
    userId,
    username: user.username,
    email: user.email,
  });
}

/** Walk sponsor chain: when a member joins or becomes active/inactive, every upline’s “level completed” may change. */
export async function syncDigitalPoolCredentialsForReferralAncestors(
  db: PrismaClient,
  memberUserId: string,
): Promise<void> {
  let parentId: string | null = (
    await db.user.findUnique({
      where: { id: memberUserId },
      select: { referredById: true },
    })
  )?.referredById ?? null;

  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    try {
      await syncDigitalPoolCredentialIfEligible(db, parentId);
    } catch (e) {
      console.error("[digital-pool] sync ancestor credential failed:", parentId, e);
    }
    const next = await db.user.findUnique({
      where: { id: parentId },
      select: { referredById: true },
    });
    parentId = next?.referredById ?? null;
  }
}

/**
 * Backfill/sync: users who already qualified before hooks/cron or without opening dashboard.
 * Safe to run on a schedule (see `/api/cron/reconcile-digital-pool`).
 */
export async function reconcileDigitalPoolCredentials(
  db: PrismaClient,
  options: { take?: number } = {},
): Promise<{ scanned: number; created: number; synced: number }> {
  const take = Math.min(Math.max(options.take ?? 150, 1), 500);

  if (!hasDigitalPoolDelegate(db)) {
    console.error("[digital-pool reconcile] Prisma client missing `digitalPoolCredential` delegate.");
    return { scanned: 0, created: 0, synced: 0 };
  }

  const candidates = await db.user.findMany({
    where: {
      status: { not: "inactive" },
    },
    select: { id: true, username: true, email: true, digitalPoolCredential: { select: { userId: true } } },
    orderBy: { createdAt: "asc" },
    take,
  });

  let created = 0;
  let synced = 0;
  for (const u of candidates) {
    const level = await getBinaryLevelsCompletedForUser(db, u.id);
    if (level < MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL) continue;
    try {
      const hadCredential = Boolean(u.digitalPoolCredential);
      await persistDigitalPoolCredentialToDb(db, {
        userId: u.id,
        username: u.username,
        email: u.email,
      });
      if (hadCredential) synced += 1;
      else created += 1;
    } catch (e) {
      console.error("[digital-pool reconcile] user", u.id, e);
    }
  }

  return { scanned: candidates.length, created, synced };
}

/**
 * Full automatic Digital Pool sync after team shape changes (activation, admin activate/inactivate).
 * This is what keeps Digital Pool independent of users opening their dashboard:
 * - timestamps newly qualified uplines via `getBinaryLevelsCompletedForUser`;
 * - creates Digital Pool credentials for qualified users;
 * - rebuilds the shared pool tree and grants $100 L1 rewards to any completed member once.
 */
export async function reconcileDigitalPoolAfterTeamChange(
  db: PrismaClient,
  memberUserId: string,
): Promise<{
  credentialsScanned: number;
  credentialsCreated: number;
  credentialsSynced: number;
  rewardsChecked: number;
  rewardsGranted: number;
}> {
  await syncDigitalPoolCredentialsForReferralAncestors(db, memberUserId);
  const creds = await reconcileDigitalPoolCredentials(db, { take: 200 });
  const { nodes } = await buildDigitalPoolNetworkResponse(db, memberUserId);
  let rewardsChecked = 0;
  let rewardsGranted = 0;
  try {
    const rewards = await tryGrantDigitalPoolL1RewardsForCompletedTree(db, nodes);
    rewardsChecked = rewards.checked;
    rewardsGranted = rewards.granted;
  } catch (e) {
    console.error("[reconcileDigitalPoolAfterTeamChange] rewards", e);
  }

  return {
    credentialsScanned: creds.scanned,
    credentialsCreated: creds.created,
    credentialsSynced: creds.synced,
    rewardsChecked,
    rewardsGranted,
  };
}

/** Scheduled/global reconcile for old data and periodic safety runs. */
export async function reconcileDigitalPoolSystem(
  db: PrismaClient,
  options: { take?: number } = {},
): Promise<{
  credentialsScanned: number;
  credentialsCreated: number;
  credentialsSynced: number;
  rewardsChecked: number;
  rewardsGranted: number;
}> {
  const creds = await reconcileDigitalPoolCredentials(db, { take: options.take });
  const mergedNodes = await buildDigitalPoolNetworkAllLegsForReconcile(db);
  let rewardsChecked = 0;
  let rewardsGranted = 0;
  try {
    const rewards = await tryGrantDigitalPoolL1RewardsForCompletedTree(db, mergedNodes);
    rewardsChecked = rewards.checked;
    rewardsGranted = rewards.granted;
  } catch (e) {
    console.error("[reconcileDigitalPoolSystem] rewards", e);
  }

  return {
    credentialsScanned: creds.scanned,
    credentialsCreated: creds.created,
    credentialsSynced: creds.synced,
    rewardsChecked,
    rewardsGranted,
  };
}
