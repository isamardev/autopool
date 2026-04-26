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
    const completedTreeRewards = await tryGrantDigitalPoolL1RewardsForCompletedTree(db, nodes);
    const userAfter = await db.user.findUnique({
      where: { id: session.userId },
      select: { digitalPoolRewardGrantedCount: true },
    });
    const viewerGrantedNow = (userAfter?.digitalPoolRewardGrantedCount ?? 0) > rewardCountBefore;

    return NextResponse.json({
      nodes,
      levels,
      total,
      viewerDirectReferrals,
      poolTreeAnchorId,
      poolLegRootId,
      viewerPoolMemberId: session.userId,
      minBinaryLevel: MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL,
      digitalPoolL1Reward: { granted: viewerGrantedNow, alreadyGranted: !viewerGrantedNow },
      digitalPoolCompletedTreeRewards: completedTreeRewards,
      digitalPoolCascadedSlots: getDigitalPoolCascadedSlotSummary(nodes),
      viewerDigitalPoolL1Complete,
      digitalPoolEligibleLegs: poolLegs,
      digitalPoolRawDirectQualified: rawDirectQualified,
    });
  } catch (e) {
    console.error("digital-pool/my-network:", e);
    return NextResponse.json({ error: "Failed to load network" }, { status: 500 });
  }
}
