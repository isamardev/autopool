"use client";

import { useMemo } from "react";
import { FaUser } from "react-icons/fa";

/** Company-side reward at tree root before level 1 is complete (display only). */
export const POOL_HOME_COMPANY_REWARD_USD = 100;

/** When level 1 (3 slots) is complete — total pool credit shown at root (display only). */
export const LEVEL1_COMPLETE_TOTAL_USD = 300;

/** Portion that becomes 2 funded entries on the next member’s line (display only). */
export const LEVEL1_REINVEST_TOTAL_USD = 200;

export const LEVEL1_FUNDED_ENTRY_COUNT = 2;

export const LEVEL1_FUNDED_ENTRY_USD = LEVEL1_REINVEST_TOTAL_USD / LEVEL1_FUNDED_ENTRY_COUNT;

/** Each level under a node has exactly this many positions (3-wide pool tree). */
const SLOTS_PER_NODE = 3;

/** Binary “levels completed” required for a member to appear in a slot. */
const POOL_HOME_TREE_MIN_BINARY_LEVELS = 1;

function poolMemberHasCompletedL1(teamNodes: any[], userId: string): boolean {
  return (computeCascadedSlotCounts(teamNodes).get(String(userId)) ?? 0) >= SLOTS_PER_NODE;
}

function qualifiedPoolChildrenSorted(teamNodes: any[], parentId: string): any[] {
  if (!teamNodes?.length || !parentId) return [];
  return teamNodes
    .filter(
      (n) =>
        n.referredById === parentId &&
        (Number(n.binaryLevelsCompleted ?? 0) >= POOL_HOME_TREE_MIN_BINARY_LEVELS || Boolean(n.isFundedPlaceholder)),
    )
    .slice()
    .sort((a, b) => {
      const pa = Number(a.poolPlacementIndex ?? 0);
      const pb = Number(b.poolPlacementIndex ?? 0);
      if (pa !== pb) return pa - pb;
      const ta = new Date(a.createdAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id));
    });
}

function qualifiedPoolChildren(teamNodes: any[], parentId: string): any[] {
  return qualifiedPoolChildrenSorted(teamNodes, parentId).slice(0, SLOTS_PER_NODE);
}

function computeCascadedSlotCounts(teamNodes: any[]): Map<string, number> {
  const counts = new Map<string, number>();
  const ids = (teamNodes ?? []).map((n) => String(n.id ?? "")).filter(Boolean);
  for (const id of ids) {
    counts.set(id, qualifiedPoolChildren(teamNodes, id).length);
  }

  return counts;
}

/** Qualified (plan L1+) descendants in the shared pool tree under this parent — not `depth > 0` (company is depth 0). */
function countQualifiedPoolDescendants(teamNodes: any[], parentId: string): number {
  if (!parentId || !teamNodes?.length) return 0;
  let count = 0;
  const walk = (pid: string) => {
    for (const n of teamNodes) {
      if (String(n.referredById) !== pid) continue;
      if (Number(n.binaryLevelsCompleted ?? 0) >= POOL_HOME_TREE_MIN_BINARY_LEVELS || Boolean(n.isFundedPlaceholder)) {
        count++;
      }
      walk(String(n.id));
    }
  };
  walk(parentId);
  return count;
}

/**
 * Sirf **asli Digital Pool tree**: root ke 3 direct pool bachay hi Position 1–3 par.
 * Pehle yahan viewer ke DB directs / “pool wide” fill ho jata tha — is se bina L1 wale ya galat branch ke naam bhi slot par aa jate thay.
 */
function mergeL1DisplaySlots(
  _teamNodes: any[],
  _viewerId: string,
  globalPlacement: [any | null, any | null, any | null],
  _viewerDirectReferrals: any[],
): [any | null, any | null, any | null] {
  void _teamNodes;
  void _viewerId;
  void _viewerDirectReferrals;
  return [globalPlacement[0] ?? null, globalPlacement[1] ?? null, globalPlacement[2] ?? null];
}

function l1CardSubtitle(node: any | null, teamNodes: any[]): { text: string; note?: string } {
  if (!node?.username) return { text: "Vacant" };
  const base = String(node.username);
  const inPool = teamNodes.some((n) => String(n.id) === String(node.id));
  if (inPool) return { text: base };
  return { text: base, note: "Referral line · user panel L1 baad mein pool mein aayenge" };
}

function padThreeSlots(children: any[]): [any | null, any | null, any | null] {
  return [children[0] ?? null, children[1] ?? null, children[2] ?? null];
}

/**
 * Digital Pool L1 complete: Position 1 column always shows 2× funded L2 slots ($100 each), then the 3rd slot is the
 * first real downline under that branch (if any). Works even when Position 1’s L1 card is still vacant — funded rows
 * are tied to “your Position 1”, not to having an L1 name in the card.
 */
function l2SlotsWithFundedUnderPosition1(
  l1: any | null,
  teamNodes: any[],
): [any | null, any | null, any | null] {
  const raw = l1 ? qualifiedPoolChildren(teamNodes, String(l1.id)) : [];
  return padThreeSlots(raw);
}

/**
 * Same global Digital Pool queue for everyone: first qualified user under company, then next members in placement order.
 * Home preview shows the first three placed members before filling with viewer-specific entries.
 */
function pickGlobalPlacementPositions(teamNodes: any[]): [any | null, any | null, any | null] {
  if (!teamNodes?.length) return [null, null, null];
  const top = teamNodes
    .filter((n) => Number(n.poolPlacementIndex ?? 0) > 0)
    .slice()
    .sort((a, b) => {
      const pa = Number(a.poolPlacementIndex ?? 0);
      const pb = Number(b.poolPlacementIndex ?? 0);
      if (pa !== pb) return pa - pb;
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, SLOTS_PER_NODE);
  return [top[0] ?? null, top[1] ?? null, top[2] ?? null];
}



function EntryCard({
  title,
  subtitle,
  highlight,
  vacantLabel,
  compact,
  detail,
}: {
  title: string;
  subtitle: string;
  highlight?: boolean;
  vacantLabel?: string;
  compact?: boolean;
  detail?: string;
}) {
  const Icon = FaUser;
  return (
    <div
      className={`flex flex-col items-center rounded-2xl text-center ring-1 ${
        compact ? "px-2 py-3" : "px-4 py-5"
      } ${
        highlight
          ? "bg-primary/10 ring-primary/30"
          : vacantLabel
            ? "border border-dashed border-primary/20 bg-muted/30 ring-ring"
            : "bg-card ring-ring"
      }`}
    >
      <div
        className={`flex items-center justify-center rounded-full bg-primary/15 ring-1 ring-ring text-foreground ${
          compact ? "h-8 w-8" : "h-10 w-10"
        }`}
      >
        <Icon className="text-primary" size={compact ? 14 : 18} />
      </div>
      <div
        className={`mt-2 font-semibold uppercase tracking-wide text-subtext ${compact ? "text-[9px]" : "text-xs"}`}
      >
        {title}
      </div>
      <div
        className={`mt-0.5 font-semibold text-foreground ${compact ? "text-[11px] leading-tight" : "text-sm"}`}
      >
        {subtitle}
      </div>
      {detail ? (
        <div className={`mt-1 text-subtext ${compact ? "text-[9px] leading-snug" : "text-[10px] leading-snug"}`}>
          {detail}
        </div>
      ) : null}
      {vacantLabel ? (
        <div className={`mt-1.5 text-subtext ${compact ? "text-[10px] leading-snug" : "text-xs"}`}>{vacantLabel}</div>
      ) : null}
    </div>
  );
}

type ColumnModel = {
  l1: any | null;
  l2: [any | null, any | null, any | null];
};

/**
 * Flow: pehle main user panel par plan level 1 complete (dashboard “Level Completed” / binary L1) — tab hi member
 * Digital Pool network mein aata hai (same rule: binary / plan level ≥ 1).
 * Placement ek global 3-wide queue hai: first qualified under company/admin, next 3 under first qualified member.
 */
export function PoolHomeThreeEntries({
  teamNodes,
  viewerUsername,
  viewerKey = "",
  viewerDirectReferrals = [],
  poolNetworkInfo = { error: null, status: null, details: null },
  level1CompleteServerHint = false,
}: {
  teamNodes: any[] | null;
  viewerUsername: string;
  /** Stable user id for React keys when tree is empty but L1 is confirmed server-side. */
  viewerKey?: string;
  viewerDirectReferrals?: any[];
  /** Set after /api/digital-pool/my-network returns — shows real errors instead of silent empty tree. */
  poolNetworkInfo?: { error: string | null; status: number | null; details?: string | null };
  /**
   * True when DB has `digitalPoolL1RewardGrantedAt` or my-network returned L1 reward granted/alreadyGranted.
   * Unlocks funded L2 + banner even if local tree leg count is wrong (dates/referredById JSON quirks).
   */
  level1CompleteServerHint?: boolean;
}) {
  const loading = teamNodes === null;
  const vacantHintL1 =
    "Pehle user panel par level 1 complete hota hai, phir member global Digital Pool queue mein next position par auto place hota hai.";
  const vacantHintL2 = `Downline · ${vacantHintL1}`;
  const level2LockedHint =
    "Pehle apna Digital Pool level 1 complete karein — 3 direct pool legs bharen; tab level 2 khule ga.";

  const { viewerId, columns, treeLevel1Complete } = useMemo(() => {
    const emptyCols: ColumnModel[] = Array.from({ length: SLOTS_PER_NODE }, () => ({
      l1: null,
      l2: [null, null, null] as [any | null, any | null, any | null],
    }));

    const stableViewerKey = viewerKey || viewerUsername || "viewer";

    if (!teamNodes || teamNodes.length === 0) {
      if (!level1CompleteServerHint) {
        return {
          viewerId: "",
          columns: emptyCols,
          level1Filled: 0,
          level1Complete: false,
          treeLevel1Complete: false,
        };
      }
      const colsGranted: ColumnModel[] = [0, 1, 2].map((i) => ({
        l1: null,
        l2: [null, null, null] as [any | null, any | null, any | null],
      }));
      return {
        viewerId: stableViewerKey,
        columns: colsGranted,
        level1Filled: SLOTS_PER_NODE,
        level1Complete: true,
        treeLevel1Complete: true,
      };
    }

    /** Logged-in member in the one global pool tree (root = company); pool `referredById` legs are under this id. */
    const vid = String(viewerKey || "").trim();
    if (!vid) {
      if (level1CompleteServerHint) {
        const colsGranted: ColumnModel[] = [0, 1, 2].map((i) => ({
          l1: null,
          l2: [null, null, null] as [any | null, any | null, any | null],
        }));
        return {
          viewerId: stableViewerKey,
          columns: colsGranted,
          level1Filled: SLOTS_PER_NODE,
          level1Complete: true,
          treeLevel1Complete: true,
        };
      }
      return {
        viewerId: "—",
        columns: emptyCols,
        level1Filled: 0,
        level1Complete: false,
        treeLevel1Complete: false,
      };
    }

    const l1Kids = qualifiedPoolChildren(teamNodes, vid);
    const filled = l1Kids.length;
    const treeSaysComplete = filled >= SLOTS_PER_NODE;
    const rawDirectQualifiedCount = (viewerDirectReferrals ?? []).filter(
      (r: { binaryLevelsCompleted?: unknown }) => Number(r.binaryLevelsCompleted ?? 0) >= 1,
    ).length;
    const clientSaysCompleteByDirects = rawDirectQualifiedCount >= SLOTS_PER_NODE;
    const level1CompleteNow =
      treeSaysComplete || level1CompleteServerHint || clientSaysCompleteByDirects;
    const globalRoot = teamNodes.find((n) => Number(n.depth) === 0 || n.referredById == null);
    const rootChildren = globalRoot
      ? padThreeSlots(qualifiedPoolChildrenSorted(teamNodes, String(globalRoot.id)))
      : pickGlobalPlacementPositions(teamNodes);
    const rootComplete = Boolean(globalRoot) && poolMemberHasCompletedL1(teamNodes, String(globalRoot.id));
    const l1Display = mergeL1DisplaySlots(teamNodes, vid, rootChildren, viewerDirectReferrals ?? []);

    const cols: ColumnModel[] = [0, 1, 2].map((i) => {
      const l1 = l1Display[i] ?? null;
      return {
        l1,
        l2: l2SlotsWithFundedUnderPosition1(l1, teamNodes),
      };
    });
    return {
      viewerId: vid,
      columns: cols,
      level1Filled: level1CompleteNow ? Math.max(filled, SLOTS_PER_NODE) : filled,
      level1Complete: level1CompleteNow,
      treeLevel1Complete: rootComplete,
    };
  }, [teamNodes, viewerDirectReferrals, level1CompleteServerHint, viewerKey, viewerUsername]);

  const downlineInPool = useMemo(() => {
    if (loading || !teamNodes?.length) return 0;
    const vid = String(viewerKey || "").trim();
    if (!vid) return 0;
    return countQualifiedPoolDescendants(teamNodes, vid);
  }, [loading, teamNodes, viewerKey]);

  const globalRootName = useMemo(() => {
    const root = teamNodes?.find((n) => Number(n.depth) === 0 || n.referredById == null);
    const name = root?.username ? String(root.username).trim() : "";
    return name || "Company / Admin";
  }, [teamNodes]);

  const showTree = Boolean(teamNodes && teamNodes.length > 0);

  return (
    <div className="rounded-2xl bg-card p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
      <div className="text-sm font-semibold text-foreground">Digital pool tree</div>

      {loading ? (
        <div className="mt-6 text-sm text-subtext">Loading tree…</div>
      ) : (
        <div className="mt-6">
          {poolNetworkInfo.error ? (
            <div className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-center text-xs text-foreground ring-1 ring-red-500/30">
              <span className="font-medium">Pool API error:</span> {poolNetworkInfo.error}
              {poolNetworkInfo.status != null ? ` (HTTP ${poolNetworkInfo.status})` : ""}. Session / login check karein —
              aksar iska matlab <span className="font-medium">Digital Pool dubara login</span> ya{" "}
              <span className="font-medium">AUTH_SECRET</span> server par set nahi.
              {poolNetworkInfo.details ? (
                <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-background/60 px-2 py-1.5 text-left text-[11px] text-foreground ring-1 ring-ring">
                  {poolNetworkInfo.details}
                </div>
              ) : null}
            </div>
          ) : null}
          {!poolNetworkInfo.error && poolNetworkInfo.details ? (
            <div className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-center text-xs text-foreground ring-1 ring-amber-500/30">
              <span className="font-medium">Reward sync warning:</span>{" "}
              <span className="whitespace-pre-wrap break-words">{poolNetworkInfo.details}</span>
              <div className="mt-1.5 text-[10px] text-subtext">
                Tree ab bhi load ho sakta hai. Agar message mein &quot;does not exist&quot; / table aaye to server par{" "}
                <span className="font-medium">prisma migrate deploy</span> chalayein.
              </div>
            </div>
          ) : null}
          {!poolNetworkInfo.error &&
          teamNodes &&
          teamNodes.length === 0 &&
          !level1CompleteServerHint ? (
            <div className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-center text-xs text-foreground ring-1 ring-amber-500/25">
              Server ne <span className="font-medium">khali network</span> bheja — user DB / team query check karein.
              Yaad rahe: team sirf un members ki dikhti hai jinhon ne user panel par plan level 1 complete kiya ho.
            </div>
          ) : null}
          {!poolNetworkInfo.error &&
          teamNodes &&
          teamNodes.length > 0 &&
          downlineInPool === 0 ? (
            <div className="mb-4 rounded-xl bg-primary/5 px-3 py-2 text-center text-xs text-foreground ring-1 ring-primary/20">
              Network load ho gaya: <span className="font-medium">{teamNodes.length} member(s)</span> — abhi aap ke
              neeche <span className="font-medium">koi plan L1+ qualified downline</span> pool mein nahi. Jab wo user panel
              se level 1 complete karenge tab global pool queue mein next position par yahan dikhenge.
            </div>
          ) : null}
          {showTree ? (
          <>
          <div className="flex flex-col items-center">
            <div className="w-full max-w-md rounded-2xl bg-primary/10 px-5 py-3 text-center ring-1 ring-primary/30">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-subtext">
                Company / Admin · pool root (sari lines ek tree)
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">{globalRootName}</div>
            </div>

            <div className="flex h-8 w-px bg-primary/35" aria-hidden />
            <div className="h-px w-[min(100%,320px)] bg-primary/35" aria-hidden />
            <div className="flex w-full max-w-3xl justify-between gap-1 px-1 sm:gap-2 sm:px-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-1 flex-col items-center">
                  <div className="h-6 w-px bg-primary/35" aria-hidden />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {columns.map((col, colIdx) => {
              const l1Sub = l1CardSubtitle(col.l1, teamNodes ?? []);
              return (
              <div key={`${viewerId}-col-${colIdx}`} className="flex min-w-0 flex-col items-stretch gap-3">
                <EntryCard
                  title={`Position ${colIdx + 1} · global order`}
                  subtitle={l1Sub.text}
                  detail={l1Sub.note}
                  highlight={Boolean(col.l1)}
                  vacantLabel={col.l1 ? undefined : vacantHintL1}
                />
                <div className="flex justify-center" aria-hidden>
                  <div className="h-4 w-px bg-primary/35" />
                </div>
                <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-subtext">
                  {treeLevel1Complete
                    ? `Level 2 · branch ${colIdx + 1} (${SLOTS_PER_NODE} under this slot)`
                    : `Level 2 · locked — root ka Digital Pool L1 pehle complete hoga`}
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {col.l2.map((m, j) => {
                    const l2Locked = !treeLevel1Complete;
                    const isFunded = Boolean(m?.isFundedPlaceholder);
                    const showMember = !l2Locked && Boolean(m);
                    // Level 3: children of this L2 node
                    const l3Kids =
                      !l2Locked && m?.id
                        ? qualifiedPoolChildren(teamNodes ?? [], String(m.id))
                        : [];
                    return (
                      <div key={m?.id != null ? `l2-wrap-${colIdx}-${String(m.id)}` : `l2-wrap-${colIdx}-${j}`} className="min-w-0 flex flex-col gap-1">
                        <EntryCard
                          compact
                          title={`${j + 1}`}
                          subtitle={l2Locked ? "Locked" : m?.username ? String(m.username) : "—"}
                          detail={
                            !l2Locked && isFunded
                              ? `$${Number(m?.fundedUsd ?? LEVEL1_FUNDED_ENTRY_USD)} USD · auto`
                              : undefined
                          }
                          highlight={showMember}
                          vacantLabel={
                            l2Locked
                              ? level2LockedHint
                              : col.l1
                                ? m
                                  ? undefined
                                  : vacantHintL2
                                : "Global position not filled yet"
                          }
                        />
                        {/* Level 3 — children of this L2 slot */}
                        {l3Kids.length > 0 ? (
                          <div className="grid grid-cols-3 gap-1 mt-0.5">
                            {l3Kids.slice(0, 3).map((k, ki) => {
                              const kFunded = Boolean(k?.isFundedPlaceholder);
                              const kOwner = kFunded
                                ? String(k.username ?? "").split("·")[0]?.trim() || "Member"
                                : null;
                              return (
                                <div
                                  key={`l3-${String(k.id)}-${ki}`}
                                  className="rounded-lg px-1 py-1.5 text-center ring-1 bg-primary/10 ring-primary/30 flex flex-col items-center"
                                >
                                  <div className="text-[8px] font-semibold uppercase text-subtext">L3·{ki + 1}</div>
                                  <div className="truncate w-full text-[10px] font-semibold text-primary mt-0.5">
                                    {kFunded ? "$100 Auto" : String(k.username ?? "—")}
                                  </div>
                                  {kOwner ? (
                                    <div className="truncate w-full text-[8px] text-subtext mt-0.5">{kOwner} ki entry</div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            })}
          </div>
          </>
          ) : !poolNetworkInfo.error &&
          teamNodes &&
          teamNodes.length === 0 &&
          level1CompleteServerHint ? (
            <div className="mt-4 text-center text-sm text-subtext">
              Pool tree yahan tab dikhe ga jab is leg ka network data load ho jaye.
            </div>
          ) : null}

        </div>
      )}
    </div>
  );
}
