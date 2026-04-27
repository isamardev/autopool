import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { DIGITAL_POOL_COOKIE, verifyDigitalPoolSession } from "@/lib/digital-pool-session";
import { reconcileDigitalPoolSystem } from "@/lib/digital-pool-credential-db";
import { buildDigitalPoolNetworkResponse } from "@/lib/digital-pool-network-tree";
import { MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL } from "@/lib/digital-pool-network-config";
import {
  getDigitalPoolCascadedSlotSummary,
  tryGrantDigitalPoolL1RewardsForCompletedTree,
  viewerMeetsDigitalPoolL1CompletionRule,
} from "@/lib/digital-pool-l1-reward";

/** User-facing hint when reward sync fails (stale Prisma client or missing migration). */
function formatDigitalPoolRewardSyncErrorMessage(raw: string): string {
  if (/Cannot read properties of undefined \(reading ['"]findMany['"]\)/.test(raw)) {
    return "Reward sync: Prisma client is missing the Digital Pool seat table (digitalPoolSeatReward). On the server run: npm run db:generate, fully restart the process, then npm run db:migrate:deploy.";
  }
  if (/Prisma client missing digitalPoolSeatReward/i.test(raw)) {
    return "Reward sync: Prisma client is missing digitalPoolSeatReward. On the server run: npm run db:generate, fully restart the process, then npm run db:migrate:deploy.";
  }
  if (/does not exist|doesn't exist|relation .+ does not exist|P2021|42P01|Table .+ not found/i.test(raw)) {
    return `${raw} If this mentions a missing table, on the server run: npm run db:migrate:deploy.`;
  }
  return raw;
}

export async function GET() {
  try {
    const jar = await cookies();
    const session = verifyDigitalPoolSession(jar.get(DIGITAL_POOL_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, status: true, digitalPoolL1RewardGrantedAt: true, digitalPoolRewardGrantedCount: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.status === "inactive") {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }
    if (user.status === "blocked") {
      return NextResponse.json({ error: "Account blocked" }, { status: 403 });
    }

    await reconcileDigitalPoolSystem(db, { take: 500 });

    const { nodes, levels, total, viewerDirectReferrals, poolTreeAnchorId, poolLegRootId } =
      await buildDigitalPoolNetworkResponse(db, session.userId);

    const { meets: viewerDigitalPoolL1Complete, poolLegs, rawDirectQualified } =
      viewerMeetsDigitalPoolL1CompletionRule({
        nodes,
        sessionUserId: session.userId,
        viewerDirectReferrals,
        digitalPoolL1RewardGrantedAt: user.digitalPoolL1RewardGrantedAt,
      });

    // Single idempotent function handles ALL completions (own position + funded entries).
    // Uses digitalPoolRewardGrantedCount to track how many $100 rewards have been granted.
    const rewardCountBefore = user.digitalPoolRewardGrantedCount ?? 0;
    let completedTreeRewards: Awaited<ReturnType<typeof tryGrantDigitalPoolL1RewardsForCompletedTree>> | null = null;
    let rewardSyncError: string | null = null;
    try {
      // Fresh singleton: avoids a disconnected/stale `db` if another request recycled the global client mid-flight.
      const dbForRewards = getDb();
      completedTreeRewards = await tryGrantDigitalPoolL1RewardsForCompletedTree(dbForRewards, nodes);
    } catch (reErr) {
      const raw = reErr instanceof Error ? reErr.message : String(reErr);
      rewardSyncError = formatDigitalPoolRewardSyncErrorMessage(raw);
      console.error("digital-pool/my-network reward sync:", reErr);
    }
    const userAfter = await db.user.findUnique({
      where: { id: session.userId },
      select: { digitalPoolRewardGrantedCount: true },
    });
    const viewerGrantedNow =
      completedTreeRewards != null &&
      (userAfter?.digitalPoolRewardGrantedCount ?? 0) > rewardCountBefore;

    return NextResponse.json({
      nodes,
      levels,
      total,
      viewerDirectReferrals,
      poolTreeAnchorId,
      poolLegRootId,
      viewerPoolMemberId: session.userId,
      minBinaryLevel: MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL,
      digitalPoolL1Reward: {
        granted: viewerGrantedNow,
        alreadyGranted:
          !viewerGrantedNow &&
          (Boolean(user.digitalPoolL1RewardGrantedAt) || rewardCountBefore > 0),
      },
      digitalPoolCompletedTreeRewards: completedTreeRewards,
      rewardSyncError,
      digitalPoolCascadedSlots: getDigitalPoolCascadedSlotSummary(nodes),
      viewerDigitalPoolL1Complete,
      digitalPoolEligibleLegs: poolLegs,
      digitalPoolRawDirectQualified: rawDirectQualified,
    });
  } catch (e) {
    console.error("digital-pool/my-network:", e);
    const details = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Failed to load network", details },
      { status: 500 },
    );
  }
}
