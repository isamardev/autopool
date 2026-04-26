"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { TREE_QUERY_MAX_DEPTH } from "@/lib/tree-display";
import { copyTextToClipboard } from "@/lib/copy-text";

const COMPANY_ADMIN_EMAIL = "admin@example.com";

export function PoolNetworkClient() {
  const maxLevel = TREE_QUERY_MAX_DEPTH;
  const [teamNodes, setTeamNodes] = useState<any[] | null>(null);
  const [openLevels, setOpenLevels] = useState<number[]>([]);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/digital-pool/my-network", { cache: "no-store", credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as { nodes?: unknown; error?: string };
        if (res.ok && Array.isArray(data?.nodes)) {
          setTeamNodes(data.nodes as any[]);
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
          <div className="mt-2 max-w-2xl text-sm text-subtext">Expand a level to see user IDs. Showing up to L{maxLevel}.</div>
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
                  open ? "max-h-[min(60vh,280px)] opacity-100" : "pointer-events-none max-h-0 opacity-0"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="custom-scrollbar flex max-h-[min(60vh,280px)] flex-col gap-1.5 overflow-y-auto pb-4 pt-1 text-sm text-subtext">
                  {members.length === 0 ? (
                    <div className="rounded-xl bg-card px-3 py-2 text-xs ring-1 ring-ring">No members at this level</div>
                  ) : (
                    members.slice(0, 200).map((n: any) => {
                      const directBelow = teamDirectCountByParentId.get(n.id) ?? 0;
                      const needsTwo = directBelow < 2;
                      return (
                        <div
                          key={n.id}
                          onClick={(e) => e.stopPropagation()}
                          className={`flex min-w-0 items-center justify-between gap-3 rounded-xl px-2 py-1.5 ${
                            needsTwo ? "bg-amber-500/15 ring-1 ring-amber-500/35 dark:bg-amber-500/10" : ""
                          }`}
                        >
                          <span className="truncate font-medium text-foreground">{n.username ?? "-"}</span>
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
                              <span className="max-w-[100px] truncate sm:max-w-[200px]">{n.referrerCode ?? "-"}</span>
                              <span className="text-primary">Copy</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs opacity-70 ring-1 ring-ring">
                              <span>—</span>
                              <span className="text-subtext">Locked</span>
                            </span>
                          )}
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
