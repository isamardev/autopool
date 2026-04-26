"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FaUser } from "react-icons/fa";
import { toast } from "react-toastify";
import { copyTextToClipboard } from "@/lib/copy-text";

const COMPANY_ADMIN_EMAIL = "admin@example.com";

/** Depth 0 = root (show "You"); tree depth from API; commissions cap at L20 in backend. */
export function formatUserTreeLevelLabel(depth: number) {
  const d = Number(depth);
  if (d === 0) return "You";
  return `L${d}`;
}

export type NetworkTreeNode = {
  id: string;
  username?: string | null;
  email?: string | null;
  referrerCode?: string | null;
  referredById?: string | null;
  depth?: number;
  verified?: boolean;
};

export function NetworkTree({
  nodes,
  onCopyMessage,
  origin = "",
  showLevelLabel = true,
  showReferralActions = true,
  showDeepTreeSummary = true,
}: {
  nodes: NetworkTreeNode[];
  onCopyMessage: (message: string) => void;
  origin?: string;
  /** When false, hide L1 / You under the name (e.g. Digital Pool). */
  showLevelLabel?: boolean;
  /** When false, hide referral code + copy / locked row (e.g. Digital Pool). */
  showReferralActions?: boolean;
  /** Footer when tree is very deep; hidden if false. */
  showDeepTreeSummary?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const compact = !showLevelLabel && !showReferralActions;

  const directCountByParentId = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) {
      const pid = n.referredById;
      if (pid) {
        m.set(pid, (m.get(pid) ?? 0) + 1);
      }
    }
    return m;
  }, [nodes]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth > 0) {
        setW(el.clientWidth);
      }
    };
    update();
    const timer = setTimeout(update, 100);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      clearTimeout(timer);
    };
  }, []);

  const nodesByDepth = useMemo(() => {
    const grouped: Record<number, NetworkTreeNode[]> = {};
    nodes.forEach((node) => {
      const d = Number(node.depth);
      if (!Number.isFinite(d)) return;
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(node);
    });
    return grouped;
  }, [nodes]);

  const depths = Object.keys(nodesByDepth).map(Number).sort((a, b) => a - b);
  const maxDepth = Math.max(...depths, 0);
  const downlineNodes = useMemo(() => nodes.filter((n) => Number(n.depth) > 0), [nodes]);
  const maxDownlineDepth = useMemo(
    () => (downlineNodes.length ? Math.max(...downlineNodes.map((n) => Number(n.depth))) : 0),
    [downlineNodes],
  );

  const rowH = compact ? 52 : 84;
  const padY = compact ? 16 : 20;
  const iconSize = 24;

  const rows = useMemo(() => {
    const r: Array<Array<{ x: number; y: number; node: NetworkTreeNode }>> = [];

    for (let depth = 0; depth <= maxDepth; depth += 1) {
      const levelNodes = nodesByDepth[depth] || [];
      const y = padY + depth * rowH;

      const pts = levelNodes.map((node, idx) => ({
        x: Math.round(w * ((idx + 1) / (levelNodes.length + 1))),
        y,
        node,
      }));

      r.push(pts);
    }

    return r;
  }, [maxDepth, nodesByDepth, w]);

  const svgW = w;
  const svgH = padY + (maxDepth + 1) * rowH + 20;

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  for (let depth = 0; depth < rows.length - 1; depth += 1) {
    const parentRow = rows[depth];
    const childRow = rows[depth + 1];

    parentRow.forEach((parent) => {
      const children = childRow.filter((child) => child.node.referredById === parent.node.id);

      children.forEach((child) => {
        lines.push({
          x1: parent.x,
          y1: parent.y + iconSize / 2,
          x2: child.x,
          y2: child.y - iconSize / 2,
        });
      });
    });
  }

  return (
    <div ref={ref} className="relative mt-5 w-full overflow-hidden">
      <svg width={svgW} height={svgH} className="block" style={{ maxWidth: "100%" }}>
        {lines.map((ln, idx) => (
          <line
            key={idx}
            x1={ln.x1}
            y1={ln.y1}
            x2={ln.x2}
            y2={ln.y2}
            stroke="var(--ring)"
            strokeWidth={1.5}
          />
        ))}
      </svg>

      <div className="absolute inset-0">
        {rows.flatMap((row, depth) =>
          row.map((pt, idx) => (
            <div
              key={`n-${depth}-${idx}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: pt.x, top: pt.y }}
              title={
                showLevelLabel
                  ? `${pt.node.username} · ${formatUserTreeLevelLabel(Number(pt.node.depth))}`
                  : String(pt.node.email === COMPANY_ADMIN_EMAIL ? "Admin" : pt.node.username ?? "")
              }
            >
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 ring-1 ring-ring">
                  <FaUser className="text-foreground" size={16} />
                </div>
                <div className="mt-1 max-w-[80px] truncate text-xs font-medium text-foreground">
                  {pt.node.email === COMPANY_ADMIN_EMAIL ? "Admin" : pt.node.username}
                </div>
                {showLevelLabel ? (
                  <div className="text-[10px] text-subtext">{formatUserTreeLevelLabel(Number(pt.node.depth))}</div>
                ) : null}
                {showReferralActions ? (
                  (directCountByParentId.get(pt.node.id) ?? 0) >= 2 ? null : pt.node.email === COMPANY_ADMIN_EMAIL ||
                    pt.node.verified ? (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const text = origin ? `${origin}/?ref=${pt.node.referrerCode}` : pt.node.referrerCode;
                        const ok = await copyTextToClipboard(String(text ?? ""));
                        if (ok) {
                          onCopyMessage(
                            `Copied ${pt.node.email === COMPANY_ADMIN_EMAIL ? "Admin" : pt.node.username}'s referral link`,
                          );
                          toast.success("Referral link copied");
                        } else {
                          onCopyMessage("Copy failed");
                          toast.error("Copy failed");
                        }
                      }}
                      className="mt-1 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-[10px] text-subtext ring-1 ring-ring transition hover:text-foreground"
                      title="Copy team member referral link"
                    >
                      <span className="max-w-[120px] truncate sm:max-w-[200px]">{pt.node.referrerCode}</span>
                      <span className="text-primary">Copy</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="mt-1 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-[10px] text-subtext ring-1 ring-ring opacity-70"
                      title="Referral locked until verified"
                    >
                      <span className="max-w-[120px] truncate sm:max-w-[200px]">—</span>
                      <span className="text-subtext">Locked</span>
                    </button>
                  )
                ) : null}
              </div>
            </div>
          )),
        )}
      </div>

      {showDeepTreeSummary && maxDownlineDepth > 7 ? (
        <div className="mt-6 rounded-2xl bg-muted p-4 ring-1 ring-ring">
          <div className="text-xs text-subtext">
            Showing {downlineNodes.length} team members across {maxDownlineDepth} downline levels (L1–L{maxDownlineDepth};
            payouts L1–L20)
          </div>
        </div>
      ) : null}
    </div>
  );
}
