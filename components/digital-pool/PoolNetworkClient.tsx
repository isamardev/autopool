"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { TREE_QUERY_MAX_DEPTH } from "@/lib/tree-display";
import { copyTextToClipboard } from "@/lib/copy-text";

const COMPANY_ADMIN_EMAIL = "admin@example.com";

type PoolNode = {
  id: string;
  username?: string | null;
  email?: string | null;
  referrerCode?: string | null;
  referredById?: string | null;
  depth?: number;
  verified?: boolean;
  poolPlacementIndex?: number;
  slotsFilled?: number;
  isFundedPlaceholder?: boolean;
  ownerId?: string;
  entryLevel?: number;
};

function buildViewerSubtree(nodes: PoolNode[], rootId: string): PoolNode[] {
  if (!rootId) return [];
  const byId = new Map(nodes.map((n) => [String(n.id), n] as const));

  // Find all entries owned by the viewer
  const viewerEntries = nodes.filter((n) => String(n.ownerId) === rootId);
  if (viewerEntries.length === 0 && !byId.has(rootId)) return [];

  const out: PoolNode[] = [];
  const visited = new Set<string>();

  // For each entry owned by the viewer, find its direct children
  for (const entry of viewerEntries) {
    const entryLevel = entry.entryLevel ?? 1;
    const children = nodes.filter((n) => String(n.referredById) === String(entry.id));

    for (const child of children) {
      const cid = String(child.id);
      if (visited.has(cid)) continue;
      visited.add(cid);

      out.push({
        ...child,
        depth: entryLevel,
        // We keep referredById so "Neeche" (if it existed) could work,
        // but the user wants to see them grouped by entry levels.
      });
    }
  }

  // Sort by depth then placement index
  out.sort((a, b) => {
    const da = a.depth ?? 0;
    const db = b.depth ?? 0;
    if (da !== db) return da - db;
    const pa = a.poolPlacementIndex ?? 0;
    const pb = b.poolPlacementIndex ?? 0;
    return pa - pb;
  });

  return out;
}

function displayPoolName(n: PoolNode) {
  if (n.email === COMPANY_ADMIN_EMAIL) return "AD";
  return n.username ?? "-";
}

export function PoolNetworkClient() {
  const maxLevel = TREE_QUERY_MAX_DEPTH;
  const [teamNodes, setTeamNodes] = useState<any[] | null>(null);
  const [openLevels, setOpenLevels] = useState<number[]>([]);
  const [openBelowMemberIds, setOpenBelowMemberIds] = useState<Set<string>>(() => new Set());
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/digital-pool/my-network", { cache: "no-store", credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as {
          nodes?: unknown;
          viewerPoolMemberId?: unknown;
          error?: string;
        };
        if (res.ok && Array.isArray(data?.nodes)) {
          const viewerId = typeof data?.viewerPoolMemberId === "string" ? data.viewerPoolMemberId : "";
          const nodes = data.nodes as PoolNode[];
          setTeamNodes(viewerId ? buildViewerSubtree(nodes, viewerId) : []);
        } else {
          setTeamNodes([]);
          const msg = typeof data?.error === "string" ? data.error : "Request failed";
          toast.error(
            res.status === 401
              ? "Network: session khatam — dubara Digital Pool login"
              : `${msg} (${res.status})`,
          );
        }
      } catch {
        setTeamNodes([]);
        toast.error("Network load fail — refresh karein");
      }
    };
    void load();
  }, []);

  const teamDownlineCount = useMemo(
    () => (teamNodes ? teamNodes.filter((n: any) => Number(n.depth) > 0).length : 0),
    [teamNodes],
  );

  const teamDirectCountByParentId = useMemo(() => {
    const m = new Map<string, number>();
    if (!teamNodes) return m;
    for (const n of teamNodes) {
      const pid = n.referredById;
      if (pid) m.set(pid, (m.get(pid) ?? 0) + 1);
    }
    return m;
  }, [teamNodes]);

  /** Direct pool children (same as `referredById` parent link in API), sorted by placement order. */
  const childrenByParentId = useMemo(() => {
    const m = new Map<string, PoolNode[]>();
    if (!teamNodes) return m;
    for (const n of teamNodes as PoolNode[]) {
      const pid = n.referredById ? String(n.referredById) : "";
      if (!pid) continue;
      const arr = m.get(pid) ?? [];
      arr.push(n);
      m.set(pid, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const pa = Number(a.poolPlacementIndex ?? 0);
        const pb = Number(b.poolPlacementIndex ?? 0);
        if (pa !== pb) return pa - pb;
        return String(a.id).localeCompare(String(b.id));
      });
    }
    return m;
  }, [teamNodes]);

  const toggleBelowPanel = (memberId: string) => {
    setOpenBelowMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  if (!teamNodes) {
    return (
      <div className="rounded-3xl bg-card p-6 ring-1 ring-ring">
        <div className="text-sm text-subtext">Loading network…</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-subtext">My Network</div>
          <div className="mt-1 text-2xl font-semibold">Level-wise View</div>
          <div className="mt-2 max-w-2xl text-sm text-subtext">
            Level 1 = aap ke neeche 3 pool positions. Jab kisi seat par 3 bande complete ho jate hain to us ko 2 nayi entries
            milti hain jo agli level (depth) par tree mein dikhti hain — isi tarah neeche levels barhti hain. Har bande ke saath
            &quot;Neeche&quot; se uske turant niche wale members dekhein. Takreeban L{maxLevel} tak.
          </div>
        </div>
        <div className="text-xs text-subtext">{teamDownlineCount} members</div>
      </div>

      <div className="mt-6">
        {Array.from({ length: maxLevel }, (_, i) => i + 1).map((lvl) => {
          const members = teamNodes.filter((n: any) => Number(n.depth) === lvl);
          const count = members.length;
          const open = openLevels.includes(lvl);
          const toggleLevel = () =>
            setOpenLevels((prev) => (prev.includes(lvl) ? prev.filter((x) => x !== lvl) : [...prev, lvl]));
          return (
            <div
              key={lvl}
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onClick={toggleLevel}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleLevel();
                }
              }}
              className="mb-3 cursor-pointer rounded-2xl bg-muted ring-1 ring-ring outline-none transition hover:ring-primary/25 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="pointer-events-none flex w-full select-none items-center justify-between px-5 py-4 text-left">
                <span className="text-base font-medium text-foreground">Level {lvl}</span>
                <span className="rounded-full bg-card px-3 py-1 text-sm text-subtext ring-1 ring-ring">
                  {count} {count === 1 ? "member" : "members"}
                </span>
              </div>
              <div
                className={`overflow-hidden px-5 transition-[max-height,opacity] duration-300 ease-out ${
                  open ? "max-h-[min(70vh,420px)] opacity-100" : "pointer-events-none max-h-0 opacity-0"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="custom-scrollbar flex max-h-[min(70vh,420px)] flex-col gap-2 overflow-y-auto pb-4 pt-1 text-sm text-subtext">
                  {members.length === 0 ? (
                    <div className="rounded-xl bg-card px-3 py-2 text-xs ring-1 ring-ring">No members at this level</div>
                  ) : (
                    members.slice(0, 200).map((n: PoolNode) => {
                      const displayName = displayPoolName(n);
                      const idStr = String(n.id);
                      const directBelow = teamDirectCountByParentId.get(idStr) ?? 0;
                      const needsTwo = directBelow < 2;
                      const kids = childrenByParentId.get(idStr) ?? [];
                      const belowOpen = openBelowMemberIds.has(idStr);
                      const slots = Number(n.slotsFilled ?? 0);
                      const slotLabel = Number.isFinite(slots) ? `${Math.min(slots, 3)}/3` : "—";
                      return (
                        <div
                          key={n.id}
                          onClick={(e) => e.stopPropagation()}
                          className={`rounded-xl px-2 py-1.5 ring-1 ring-ring/60 ${
                            needsTwo ? "bg-amber-500/15 ring-amber-500/35 dark:bg-amber-500/10" : "bg-card/40"
                          }`}
                        >
                          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="truncate font-medium text-foreground">{displayName}</span>
                              {n.isFundedPlaceholder ? (
                                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary ring-1 ring-primary/30">
                                  Entry
                                </span>
                              ) : null}
                              <span className="shrink-0 text-[10px] text-subtext opacity-80" title="Pool slots filled under this seat">
                                {slotLabel}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {directBelow >= 2 ? null : n.email === COMPANY_ADMIN_EMAIL || n.verified ? (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const code = String(n.referrerCode ?? "");
                                    const text = origin ? `${origin}/?ref=${code}` : code;
                                    const ok = await copyTextToClipboard(text);
                                    if (ok) toast.success("Referral link copied");
                                    else toast.error("Copy failed");
                                  }}
                                  className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs text-subtext ring-1 ring-ring transition hover:text-foreground"
                                >
                                  <span className="max-w-[72px] truncate sm:max-w-[140px]">{n.referrerCode ?? "-"}</span>
                                  <span className="text-primary">Copy</span>
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs opacity-70 ring-1 ring-ring">
                                  <span>—</span>
                                  <span className="text-subtext">Locked</span>
                                </span>
                              )}
                              <button
                                type="button"
                                aria-expanded={belowOpen}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBelowPanel(idStr);
                                }}
                                className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-xs text-foreground ring-1 ring-ring transition hover:bg-muted"
                              >
                                Neeche
                                <span className="text-subtext">({kids.length})</span>
                                <span className="text-[10px] text-subtext" aria-hidden>
                                  {belowOpen ? "▲" : "▼"}
                                </span>
                              </button>
                            </div>
                          </div>
                          {belowOpen ? (
                            <div className="mt-2 border-l-2 border-primary/30 pl-3">
                              {kids.length === 0 ? (
                                <div className="text-xs text-subtext">Is ke neeche abhi koi member nahi.</div>
                              ) : (
                                <ul className="space-y-1.5 text-xs">
                                  {kids.map((c) => {
                                    const sf = Number(c.slotsFilled ?? 0);
                                    const sfLabel = Number.isFinite(sf) ? `${Math.min(sf, 3)}/3` : "—";
                                    return (
                                      <li
                                        key={c.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-2 py-1 ring-1 ring-ring/50"
                                      >
                                        <span className="font-medium text-foreground">{displayPoolName(c)}</span>
                                        <span className="text-subtext">
                                          {c.isFundedPlaceholder ? "Entry · " : ""}
                                          {sfLabel}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
