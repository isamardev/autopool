"use client";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { FaUser, FaSignOutAlt, FaEye, FaEyeSlash } from "react-icons/fa";
import { toast } from "react-toastify";
import { TREE_QUERY_MAX_DEPTH } from "@/lib/tree-display";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";

type NavItem = {
  key: string;
  label: string;
};

/** How often admin data refetches in the background while the tab is open (ms). */
const ADMIN_POLL_MS = 25_000;

type PaymentHistoryKind = "deposits" | "commissions" | "charity" | "fee";

const PAYMENT_HISTORY_SUB: { key: PaymentHistoryKind; label: string }[] = [
  { key: "deposits", label: "Deposit history" },
  { key: "commissions", label: "Admin commission history" },
  { key: "charity", label: "Charity history" },
  { key: "fee", label: "Fee history" },
];

const paymentHistoryKindLabel: Record<PaymentHistoryKind, string> = {
  deposits: "Deposit history",
  commissions: "Admin commission history",
  charity: "Charity history",
  fee: "Fee history",
};

const ADMIN_TOAST_GENERIC = "Something went wrong. Please try again.";

/** BEP20 (EVM) address: 0x + 40 hex chars — same as user profile / withdraw flows. */
const BEP20_USDT_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const INVALID_BEP20_WITHDRAW_MSG =
  "Invalid withdrawal address. Enter a valid BEP20 USDT address: 0x followed by exactly 40 hexadecimal characters (42 characters total).";

/** Users table: membership status — DB may use `withdraw_suspend` but we show `active` here. */
function adminUserAccountStatusLabel(status: string | undefined) {
  const s = String(status ?? "");
  return s === "withdraw_suspend" ? "active" : s;
}

/** Withdraw column: only active / withdraw_suspend get labels; others not eligible. */
function adminUserWithdrawAccessLabel(status: string | undefined): { text: string; tone: "active" | "suspend" | "na" } {
  const s = String(status ?? "");
  if (s === "withdraw_suspend") return { text: "Withdraw suspend", tone: "suspend" };
  if (s === "active") return { text: "Withdraw active", tone: "active" };
  return { text: "—", tone: "na" };
}

/** Log full API payload; never show raw server / DB errors in toast. */
function toastAdminApiError(payload: unknown) {
  console.error("[admin API]", payload);
  toast.error(ADMIN_TOAST_GENERIC);
}

const navItems: NavItem[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "deposits", label: "Deposits" },
  { key: "settings", label: "Settings" },
  { key: "roles", label: "Roles" },
];

const ROLE_CHECKBOX_OPTIONS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "deposits", label: "Deposits" },
  { key: "settings", label: "Settings" },
  { key: "withdrawals", label: "Withdrawals" },
  { key: "payments", label: "Payment History" },
];

type AdminNavKey = NavItem["key"] | "payments" | "withdrawPending" | "withdrawHistory";

function ConfirmationModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onCancel}
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-all duration-300"
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-card p-6 shadow-2xl ring-1 ring-ring animate-in fade-in zoom-in duration-200">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <span className="text-xl">⚠️</span>
          </div>
          <h3 className="text-lg font-semibold text-foreground">Are you sure?</h3>
          <p className="mt-2 text-sm text-subtext">{message}</p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="rounded-full bg-muted py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/80"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-primary py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function WithdrawApproveModal({
  username,
  email,
  netAmount,
  address,
  txHash,
  onTxHashChange,
  loading,
  onConfirm,
  onCancel,
}: {
  username: string;
  email: string;
  netAmount: string;
  address: string;
  txHash: string;
  onTxHashChange: (v: string) => void;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close"
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-all duration-300"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-approve-title"
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-card p-6 shadow-2xl ring-1 ring-ring animate-in fade-in zoom-in duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <span className="text-lg">✓</span>
            </div>
            <h3 id="withdraw-approve-title" className="mt-3 text-lg font-semibold text-foreground">
              Approve withdrawal
            </h3>
            <p className="mt-1 text-sm text-subtext">Enter the on-chain payout transaction hash (BSC USDT).</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-subtext transition hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-muted/50 p-4 text-sm ring-1 ring-ring/60">
          <div className="grid gap-2">
            <div className="flex justify-between gap-2">
              <span className="text-subtext">User</span>
              <span className="max-w-[60%] truncate text-right font-medium text-foreground">{username}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-subtext">Email</span>
              <span className="max-w-[60%] truncate text-right text-xs text-foreground">{email}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-subtext">Net amount</span>
              <span className="font-semibold text-primary">{netAmount} USDT</span>
            </div>
            <div className="border-t border-ring/40 pt-2">
              <span className="text-xs text-subtext">Recipient address</span>
              <div className="mt-1 break-all font-mono text-[11px] leading-relaxed text-foreground">{address}</div>
            </div>
          </div>
        </div>

        <label className="mt-5 grid gap-2">
          <span className="text-sm font-medium text-foreground">Transaction hash</span>
          <input
            autoFocus
            value={txHash}
            onChange={(e) => onTxHashChange(e.target.value)}
            placeholder="0x…"
            className="h-11 w-full rounded-2xl bg-background px-4 font-mono text-sm text-foreground ring-1 ring-ring outline-none transition focus:ring-2 focus:ring-primary/35"
          />
        </label>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-full bg-muted py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !txHash.trim()}
            className="rounded-full bg-primary py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Approve & save hash"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 sm:p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] min-w-0">
      <div className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-subtext truncate">{label}</div>
      <div className="mt-1 sm:mt-2 text-lg sm:text-2xl font-bold text-foreground truncate">{value}</div>
    </div>
  );
}

/** Depth 0 = company root; downline L1…L33 (payout logic still L1–20). */
function formatAdminTreeLevelLabel(depth: number) {
  const d = Number(depth);
  if (d === 0) return "Root";
  return `L${d}`;
}

function NetworkTreeAdmin({ nodes, origin, onCopyMessage }: { nodes: any[], origin: string, onCopyMessage: (message: string) => void }) {
  const treeCanvasRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = treeCanvasRef.current;
    const update = () => {
      const cw = el?.clientWidth ?? 0;
      setW(cw > 0 ? cw : 800);
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => update()) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      if (el && ro) ro.unobserve(el);
    };
  }, [nodes]);

  const nodesByDepth = useMemo(() => {
    const grouped: Record<number, any[]> = {};
    nodes.forEach((node) => {
      const d = Number(node.depth);
      if (!Number.isFinite(d)) return;
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(node);
    });
    return grouped;
  }, [nodes]);

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

  const depths = Object.keys(nodesByDepth).map(Number).sort((a, b) => a - b);
  const maxDepth = Math.max(...depths, 0);

  const rowH = 84;
  const padY = 20;
  const iconSize = 24;

  const rows = useMemo(() => {
    const r: Array<Array<{ x: number; y: number; node: any }>> = [];
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
    <div ref={treeCanvasRef} id="admin-tree-canvas" className="relative mt-5 w-full min-w-[280px] overflow-hidden">
      <svg width={svgW} height={svgH} className="block" style={{ maxWidth: "100%" }}>
        {lines.map((ln, idx) => (
          <line key={idx} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke="var(--ring)" strokeWidth={1.5} />
        ))}
      </svg>
      <div className="absolute inset-0">
        {rows.flatMap((row, depth) =>
          row.map((pt, idx) => (
            <div key={`a-${depth}-${idx}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pt.x, top: pt.y }}>
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 ring-1 ring-ring">
                  <FaUser className="text-foreground" size={16} />
                </div>
                <div className="mt-1 text-xs font-medium text-foreground max-w-[80px] truncate">
                  {pt.node.username}
                </div>
                <div className="text-[10px] text-subtext">{formatAdminTreeLevelLabel(pt.node.depth)}</div>
                {(directCountByParentId.get(pt.node.id) ?? 0) >= 2 ? null : (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const text = origin ? `${origin}/?ref=${pt.node.referrerCode}` : pt.node.referrerCode;
                      try {
                        await navigator.clipboard.writeText(text);
                        onCopyMessage(`Copied ${pt.node.username}'s referral link`);
                        toast.success("Referral link copied");
                      } catch {
                        onCopyMessage("Copy failed");
                        toast.error("Copy failed");
                      }
                    }}
                    className="mt-1 inline-flex max-w-[min(100%,220px)] items-center gap-2 rounded-full bg-card px-3 py-1 text-[10px] text-subtext ring-1 ring-ring transition hover:text-foreground"
                    title="Copy team member referral link"
                  >
                    <span className="truncate max-w-[120px] sm:max-w-[200px]">{pt.node.referrerCode}</span>
                    <span className="shrink-0 text-primary">Copy</span>
                  </button>
                )}
              </div>
            </div>
          )),
        )}
      </div>
    </div>
  );
}

export function AdminPanelClient() {
  const { data: session, status } = useSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [active, setActive] = useState<AdminNavKey>("overview");

  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  /** Prevents background poll / refetch from overwriting WhatsApp while editing. */
  const settingsDraftDirtyRef = useRef(false);
  const [levelsMsg, setLevelsMsg] = useState("");
  const [adminTreeNodes, setAdminTreeNodes] = useState<any[]>([]);
  const [origin, setOrigin] = useState("");
  const [adminUiMsg, setAdminUiMsg] = useState("");
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [withdrawMsg, setWithdrawMsg] = useState("");
  const [withdrawApproveModal, setWithdrawApproveModal] = useState<{
    id: string;
    username: string;
    email: string;
    amount: string;
    address: string;
  } | null>(null);
  const [withdrawApproveHash, setWithdrawApproveHash] = useState("");
  const [withdrawApproveLoading, setWithdrawApproveLoading] = useState(false);
  const [withdrawSectionOpen, setWithdrawSectionOpen] = useState(false);
  const [withdrawHistoryItems, setWithdrawHistoryItems] = useState<any[]>([]);
  const [withdrawHistoryLoading, setWithdrawHistoryLoading] = useState(false);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [depositStatus, setDepositStatus] = useState<string>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [userStatusActivatingId, setUserStatusActivatingId] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const [paymentHistoryKind, setPaymentHistoryKind] = useState<PaymentHistoryKind>("deposits");
  const [paymentHistoryItems, setPaymentHistoryItems] = useState<any[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const userActivateInFlightRef = useRef(false);

  const [rolesList, setRolesList] = useState<
    {
      id: string;
      name: string;
      permissions: string[];
      _count?: { users: number };
      staffUser?: { id: string; email: string; username: string; staffPasswordPlain?: string | null } | null;
    }[]
  >([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [showNewStaffPassword, setShowNewStaffPassword] = useState(false);
  const [newRolePerms, setNewRolePerms] = useState<Record<string, boolean>>({});
  const [editingRole, setEditingRole] = useState<{
    id: string;
    name: string;
    permissions: string[];
    staffUser: { id: string; email: string; username: string; staffPasswordPlain?: string | null } | null;
  } | null>(null);
  const [editRoleName, setEditRoleName] = useState("");
  const [editRolePerms, setEditRolePerms] = useState<Record<string, boolean>>({});
  const [editStaffUsername, setEditStaffUsername] = useState("");
  const [editStaffEmail, setEditStaffEmail] = useState("");
  /** Optional new password only; empty = keep current */
  const [editStaffNewPassword, setEditStaffNewPassword] = useState("");
  const [showEditStaffPassword, setShowEditStaffPassword] = useState(false);
  const [showEditUserNewPassword, setShowEditUserNewPassword] = useState(false);
  const [editUserAccountStatus, setEditUserAccountStatus] = useState<"active" | "inactive" | "blocked">("active");
  const [editUserWithdrawalAccess, setEditUserWithdrawalAccess] = useState<"active" | "suspend">("active");
  const [adminRolesForSelect, setAdminRolesForSelect] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (userStatusFilter === "admin") setUserStatusFilter("all");
  }, [userStatusFilter]);

  useEffect(() => {
    setShowEditUserNewPassword(false);
  }, [editingUser?.id]);

  useEffect(() => {
    if (!editingUser) return;
    if (editingUser.status === "admin") return;
    setEditUserAccountStatus(editingUser.status === "blocked" ? "blocked" : "active");
    setEditUserWithdrawalAccess(editingUser.status === "withdraw_suspend" ? "suspend" : "active");
  }, [editingUser?.id]);

  const adminFullAccess = session?.user?.adminFullAccess === true;
  const adminAllowedSections = session?.user?.adminAllowedSections ?? [];
  const canAdminSection = useCallback(
    (k: string) => adminFullAccess || adminAllowedSections.includes(k),
    [adminFullAccess, adminAllowedSections],
  );

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => canAdminSection(item.key)),
    [canAdminSection],
  );

  const firstAllowedTab = useMemo(() => {
    const order: AdminNavKey[] = [
      "overview",
      "users",
      "deposits",
      "settings",
      "withdrawPending",
      "payments",
      "roles",
    ];
    const hit = order.find((k) => {
      if (k === "withdrawPending") return canAdminSection("withdrawals");
      if (k === "withdrawHistory")
        return canAdminSection("withdrawals") || canAdminSection("payments");
      if (k === "payments") return canAdminSection("payments");
      return canAdminSection(k);
    });
    return hit;
  }, [canAdminSection]);

  useEffect(() => {
    if (active === "withdrawPending" || active === "withdrawHistory") {
      setWithdrawSectionOpen(true);
    }
  }, [active]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.status !== "admin") return;
    if (!adminFullAccess && adminAllowedSections.length === 0) return;
    const can = (k: string) => adminFullAccess || adminAllowedSections.includes(k);
    if (active === "payments") {
      if (!can("payments")) {
        if (firstAllowedTab) setActive(firstAllowedTab);
        setPaymentHistoryOpen(false);
      }
      return;
    }
    if (active === "withdrawPending" || active === "withdrawHistory") {
      const okWithdrawTab =
        active === "withdrawPending" ? can("withdrawals") : can("withdrawals") || can("payments");
      if (!okWithdrawTab) {
        if (firstAllowedTab) setActive(firstAllowedTab);
        setWithdrawSectionOpen(false);
      }
      return;
    }
    if (!can(active)) {
      if (firstAllowedTab) setActive(firstAllowedTab);
    }
  }, [
    status,
    session?.user?.status,
    adminFullAccess,
    adminAllowedSections,
    active,
    firstAllowedTab,
  ]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.status !== "admin") return;
    if (active !== "roles" || !adminFullAccess) return;
    let cancelled = false;
    setRolesLoading(true);
    fetch("/api/admin/roles", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.roles)) {
          setRolesList(
            data.roles.map(
              (r: {
                id: string;
                name: string;
                permissions: unknown;
                _count?: { users: number };
                users?: { id: string; email: string; username: string; staffPasswordPlain?: string | null }[];
              }) => ({
                id: r.id,
                name: r.name,
                permissions: Array.isArray(r.permissions) ? r.permissions.filter((x: unknown) => typeof x === "string") : [],
                _count: r._count,
                staffUser: r.users?.[0] ?? null,
              }),
            ),
          );
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setRolesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, status, session?.user?.status, adminFullAccess]);

  useEffect(() => {
    if (!editingUser || editingUser.status !== "admin" || !adminFullAccess) {
      setAdminRolesForSelect([]);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/roles", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.roles)) {
          setAdminRolesForSelect(data.roles.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [editingUser, adminFullAccess]);

  useEffect(() => {
    if (!editingRole) return;
    setEditRoleName(editingRole.name);
    const m: Record<string, boolean> = {};
    for (const o of ROLE_CHECKBOX_OPTIONS) {
      m[o.key] = editingRole.permissions.includes(o.key);
    }
    setEditRolePerms(m);
    setEditStaffUsername(editingRole.staffUser?.username ?? "");
    setEditStaffEmail(editingRole.staffUser?.email ?? "");
    setEditStaffNewPassword("");
    setShowEditStaffPassword(false);
  }, [editingRole]);

  const openPaymentSub = useCallback((kind: PaymentHistoryKind) => {
    setActive("payments");
    setPaymentHistoryKind(kind);
    setPaymentHistoryOpen(true);
    setWithdrawSectionOpen(false);
    setMobileNavOpen(false);
  }, []);

  useEffect(() => {
    const o = typeof window !== "undefined" ? window.location.origin : "";
    setOrigin(o);
  }, []);

  const fetchAdminUsers = useCallback(async (silent = false) => {
    if (!silent) setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setUsers([]);
        const msg = typeof data?.error === "string" ? data.error : `Users API failed (${res.status})`;
        console.error("[admin users]", msg, data);
        return;
      }
      if (Array.isArray(data?.users)) {
        setUsers(data.users);
      } else {
        setUsers([]);
        console.warn("[admin users] Unexpected response shape", data);
      }
    } catch (e) {
      setUsers([]);
      console.error("[admin users] fetch failed", e);
    } finally {
      if (!silent) setUsersLoading(false);
    }
  }, []);

  const fetchAdminDashboardData = useCallback(async () => {
    if (status !== "authenticated" || !session?.user?.id || session.user.status !== "admin") return;
    const full = session.user.adminFullAccess === true;
    const sections = session.user.adminAllowedSections ?? [];
    const can = (s: string) => full || sections.includes(s);
    try {
      const jobs: Promise<void>[] = [];

      if (can("overview")) {
        jobs.push(
          (async () => {
            const statsRes = await fetch("/api/admin/stats", { cache: "no-store" });
            if (statsRes.ok) {
              const s = await statsRes.json();
              if (s && typeof s === "object" && !("error" in s && s.error)) setStats(s);
            } else {
              console.error("Stats API failed:", await statsRes.text());
            }
          })(),
          (async () => {
            const treeRes = await fetch("/api/admin/tree", { cache: "no-store" });
            const t = await treeRes.json().catch(() => ({}));
            if (treeRes.ok && Array.isArray(t?.nodes)) {
              setAdminTreeNodes(t.nodes);
            } else {
              setAdminTreeNodes([]);
              console.error("[admin tree]", treeRes.status, t);
            }
          })(),
        );
      }

      if (can("withdrawals")) {
        jobs.push(
          (async () => {
            const withdrawalsRes = await fetch("/api/admin/withdrawals", { cache: "no-store" });
            if (withdrawalsRes.ok) {
              const data = await withdrawalsRes.json();
              setPendingWithdrawals(data.items || []);
            }
          })(),
        );
      }

      if (can("deposits")) {
        jobs.push(
          (async () => {
            const depositsQ = depositStatus === "all" ? "" : `?status=${encodeURIComponent(depositStatus)}`;
            const depositsRes = await fetch(`/api/admin/deposits${depositsQ}`, { cache: "no-store" });
            if (depositsRes.ok) {
              const data = await depositsRes.json();
              setDeposits(data.items || []);
            }
          })(),
        );
      }

      await Promise.all(jobs);
    } catch (err) {
      console.error("Admin data load error:", err);
    }
  }, [
    depositStatus,
    session?.user?.adminAllowedSections,
    session?.user?.adminFullAccess,
    session?.user?.id,
    session?.user?.status,
    status,
  ]);

  const loadAdminSettings = useCallback(
    async (opts?: { force?: boolean }) => {
      if (status !== "authenticated") return;
      if (!session?.user?.id || session.user.status !== "admin") return;
      if (!canAdminSection("settings")) return;
      if (!opts?.force && settingsDraftDirtyRef.current) return;
      const settingsRes = await fetch("/api/admin/settings", { cache: "no-store" });
      if (!settingsRes.ok) return;
      const l = await settingsRes.json();
      const nextWhatsapp = String(l?.whatsappNumber ?? "");
      if (!settingsDraftDirtyRef.current || opts?.force) {
        setWhatsappNumber(nextWhatsapp);
      }
    },
    [canAdminSection, session?.user?.id, session?.user?.status, status],
  );

  const fetchPaymentHistory = useCallback(
    async (silent = false) => {
      if (status !== "authenticated" || !session?.user?.id || session.user.status !== "admin") return;
      if (!silent) setPaymentHistoryLoading(true);
      try {
        const res = await fetch(`/api/admin/payment-history?type=${paymentHistoryKind}`, { cache: "no-store" });
        const data = await res.json();
        if (res.ok && Array.isArray(data.items)) setPaymentHistoryItems(data.items);
        else {
          setPaymentHistoryItems([]);
          console.error("[admin payment history]", res.status, data);
        }
      } catch (e) {
        setPaymentHistoryItems([]);
        console.error("[admin payment history] fetch failed", e);
      } finally {
        if (!silent) setPaymentHistoryLoading(false);
      }
    },
    [paymentHistoryKind, session?.user?.id, session?.user?.status, status],
  );

  const fetchWithdrawHistory = useCallback(
    async (silent = false) => {
      if (status !== "authenticated" || !session?.user?.id) return;
      if (!silent) setWithdrawHistoryLoading(true);
      try {
        const res = await fetch(`/api/admin/payment-history?type=withdrawals`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.items)) {
          setWithdrawHistoryItems(data.items);
        } else {
          setWithdrawHistoryItems([]);
          const detail =
            typeof data?.error === "string"
              ? data.error
              : res.status === 403
                ? "Access denied (need Withdrawals or Payment History permission)"
                : res.status >= 500
                  ? "Server error loading withdrawal history"
                  : "Could not load withdrawal history";
          console.error("[admin withdraw history]", res.status, detail, data);
        }
      } catch (e) {
        setWithdrawHistoryItems([]);
        console.error("[admin withdraw history] fetch failed", e);
      } finally {
        if (!silent) setWithdrawHistoryLoading(false);
      }
    },
    [session?.user?.id, status],
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.id || session.user.status !== "admin") return;
    fetchAdminDashboardData().catch((e) => console.error("fetchAdminDashboardData", e));
  }, [fetchAdminDashboardData, session?.user?.id, session?.user?.status, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.id || session.user.status !== "admin") return;
    if (active !== "payments") return;
    fetchPaymentHistory(false).catch(() => undefined);
  }, [active, fetchPaymentHistory, session?.user?.id, session?.user?.status, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.id) return;
    if (active !== "withdrawHistory") return;
    fetchWithdrawHistory(false).catch(() => undefined);
  }, [active, fetchWithdrawHistory, session?.user?.id, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.id) return;
    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      fetchAdminDashboardData().catch(() => undefined);
      if (active === "users") fetchAdminUsers(true).catch(() => undefined);
      if (active === "payments") fetchPaymentHistory(true).catch(() => undefined);
      if (active === "withdrawHistory") fetchWithdrawHistory(true).catch(() => undefined);
    };
    const id = window.setInterval(refresh, ADMIN_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onFocus = () => refresh();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [
    active,
    fetchAdminDashboardData,
    fetchAdminUsers,
    fetchPaymentHistory,
    fetchWithdrawHistory,
    session?.user?.id,
    status,
  ]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.id || session.user.status !== "admin") return;
    if (active !== "users") return;
    fetchAdminUsers(false).catch(() => undefined);
  }, [active, fetchAdminUsers, session?.user?.id, session?.user?.status, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.id || session.user.status !== "admin") return;
    if (!canAdminSection("settings")) return;
    loadAdminSettings({ force: true }).catch(() => undefined);
  }, [canAdminSection, loadAdminSettings, session?.user?.id, session?.user?.status, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.id || session.user.status !== "admin") return;
    if (active !== "settings") return;
    loadAdminSettings({ force: true }).catch(() => undefined);
  }, [active, loadAdminSettings, session?.user?.id, session?.user?.status, status]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target as Node)) {
        setAdminMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = useMemo(() => {
    const email = session?.user?.email ?? "admin";
    return String(email).slice(0, 2).toUpperCase();
  }, [session?.user?.email]);
  const toUSD = useCallback(
    (n: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
        Number.isFinite(n) ? n : 0,
      ),
    [],
  );

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-transparent text-foreground">
      <div className="mx-auto max-w-7xl overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              ☰
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="hidden h-10 w-10 items-center justify-center rounded-xl bg-card shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] hover:bg-muted lg:inline-flex"
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
              <div className="flex min-w-0 items-center gap-3">
                <img src="/logo.jpeg" alt="Digital Community Magnet" className="h-8 w-auto rounded-md ring-1 ring-ring" />
              </div>
          </div>
          <div className="relative flex min-w-0 items-center gap-2" ref={adminMenuRef}>
            <button
              type="button"
              onClick={() => setAdminMenuOpen((v) => !v)}
              className="flex max-w-full items-center gap-2 rounded-2xl p-1.5 transition hover:bg-muted"
              aria-expanded={adminMenuOpen}
              aria-haspopup="menu"
            >
              <div className="min-w-0 text-right">
                <div className="truncate text-sm font-medium">{session?.user?.name ?? "Admin"}</div>
                <div className="truncate text-[10px] sm:text-xs text-subtext">{session?.user?.email ?? "-"}</div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white shadow-sm ring-1 ring-primary/20">
                {initials}
              </div>
            </button>
            {adminMenuOpen ? (
              <div
                className="absolute right-0 top-full z-50 mt-2 w-48 rounded-2xl bg-card p-1 shadow-xl ring-1 ring-ring animate-in fade-in slide-in-from-top-2 duration-200"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAdminMenuOpen(false);
                    signOut({ callbackUrl: getAuthRedirectUrl("/") });
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium text-red-500 transition hover:bg-red-500/10"
                >
                  <FaSignOutAlt className="text-red-500" size={18} aria-hidden />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className={`mt-6 grid gap-6 ${sidebarCollapsed ? "lg:grid-cols-[1fr]" : "lg:grid-cols-[260px_1fr]"}`}>
          {!sidebarCollapsed && (
          <aside className="hidden min-w-0 lg:block">
            <div className="rounded-3xl bg-card p-3 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
              <div className="px-3 py-2 text-xs font-medium text-subtext">Navigation</div>
              <div className="mt-1 grid gap-1">
                {visibleNavItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActive(item.key as AdminNavKey);
                      setPaymentHistoryOpen(false);
                      setWithdrawSectionOpen(false);
                    }}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                      active === item.key ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>{item.label}</span>
                    {active === item.key ? <span className="text-primary">●</span> : null}
                  </button>
                ))}
                {canAdminSection("withdrawals") || canAdminSection("payments") ? (
                  <div className="grid gap-1">
                    <button
                      type="button"
                      onClick={() => setWithdrawSectionOpen((v) => !v)}
                      className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                        active === "withdrawPending" || active === "withdrawHistory"
                          ? "bg-muted text-foreground"
                          : "text-subtext hover:bg-muted hover:text-foreground"
                      }`}
                      aria-expanded={withdrawSectionOpen}
                    >
                      <span>Withdraw</span>
                      <span className={`transition-transform ${withdrawSectionOpen ? "rotate-90" : ""}`}>›</span>
                    </button>
                    <div
                      className={`ml-2 grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${
                        withdrawSectionOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="min-h-0 overflow-hidden rounded-2xl bg-background ring-1 ring-ring">
                        {canAdminSection("withdrawals") ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActive("withdrawPending");
                              setWithdrawSectionOpen(true);
                              setPaymentHistoryOpen(false);
                            }}
                            className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                              active === "withdrawPending"
                                ? "bg-muted text-foreground"
                                : "text-subtext hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <span>Pending withdrawals</span>
                            {active === "withdrawPending" ? <span className="text-primary">●</span> : null}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setActive("withdrawHistory");
                            setWithdrawSectionOpen(true);
                            setPaymentHistoryOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                            active === "withdrawHistory"
                              ? "bg-muted text-foreground"
                              : "text-subtext hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span>Withdraw history</span>
                          {active === "withdrawHistory" ? <span className="text-primary">●</span> : null}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {canAdminSection("payments") ? (
                <div className="grid gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentHistoryOpen((v) => !v);
                      setWithdrawSectionOpen(false);
                    }}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                      active === "payments" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                    }`}
                    aria-expanded={paymentHistoryOpen}
                  >
                    <span>Payment History</span>
                    <span className={`transition-transform ${paymentHistoryOpen ? "rotate-90" : ""}`}>›</span>
                  </button>
                  <div
                    className={`ml-2 grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${
                      paymentHistoryOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden rounded-2xl bg-background ring-1 ring-ring">
                      {PAYMENT_HISTORY_SUB.map((sub) => (
                        <button
                          key={sub.key}
                          type="button"
                          onClick={() => openPaymentSub(sub.key)}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                            active === "payments" && paymentHistoryKind === sub.key
                              ? "bg-muted text-foreground"
                              : "text-subtext hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span>{sub.label}</span>
                          {active === "payments" && paymentHistoryKind === sub.key ? (
                            <span className="text-primary">●</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                ) : null}
              </div>
            </div>
          </aside>
          )}

          <main className="min-w-0 space-y-6">
            {active === "overview" ? (
              <>
                <div className="w-full max-w-full overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm text-subtext">Overview</div>
                      <div className="mt-1 text-2xl font-semibold">Dashboard</div>
                      <p className="mt-2 max-w-2xl text-sm text-subtext">
                        Live snapshot of members, balances, and platform totals.
                        {stats?.statsDay?.label ? (
                          <span className="text-xs">
                            {" "}
                            Today’s commissions use calendar day {stats.statsDay.label}
                            {stats.statsDay.timeZone ? ` (${stats.statsDay.timeZone})` : ""}.
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-6">
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      <StatCard
                        label="Admin wallet total"
                        value={toUSD(
                          Number(stats?.adminWalletTotal ?? stats?.availableBalance ?? stats?.adminCommissionWallet ?? 0),
                        )}
                      />
                      <StatCard
                        label="Today's commission → admin accounts"
                        value={toUSD(Number(stats?.todayCommissionToAdmin ?? 0))}
                      />
                      <StatCard
                        label="Admin commission (lifetime, admin rows only)"
                        value={toUSD(Number(stats?.adminLedgerCommissionsLifetime ?? 0))}
                      />
                    </div>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      <StatCard label="Active users" value={String(stats?.totalUsers ?? 0)} />
                      <StatCard label="Total deposit" value={toUSD(Number(stats?.totalDeposits ?? 0))} />
                      <StatCard label="All user wallets" value={toUSD(Number(stats?.allUserWallet ?? 0))} />
                      <StatCard label="All user withdrawals (approved)" value={toUSD(Number(stats?.allUserWithdraw ?? 0))} />
                      <StatCard label="Platform fee pool" value={toUSD(Number(stats?.platformFeePool ?? 0))} />
                      <StatCard label="Charity" value={toUSD(Number(stats?.charityTotal ?? 0))} />
                      <StatCard
                        label="System balance"
                        value={toUSD(
                          Number(stats?.totalWalletBalances ?? stats?.systemBalance ?? 0),
                        )}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {active === "users" ? (
              <div className="w-full max-w-full overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Users</div>
                    <div className="mt-1 text-xs text-subtext leading-relaxed sm:text-sm">
                      Users with downline count <br className="sm:hidden" />
                      (tree depth {TREE_QUERY_MAX_DEPTH} · commissions L1–20)
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                      className="h-9 rounded-xl bg-background px-3 text-xs text-foreground ring-1 ring-ring sm:h-10 sm:rounded-2xl sm:text-sm"
                    >
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="blocked">Blocked</option>
                      <option value="withdraw_suspend">Withdraw suspend</option>
                    </select>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-9 w-full min-w-[120px] flex-1 rounded-xl bg-background px-4 text-xs text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30 sm:h-10 sm:w-40 sm:rounded-2xl sm:text-sm"
                      placeholder="Search"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        fetchAdminUsers().catch(() => undefined);
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-card px-4 text-xs font-medium text-foreground ring-1 ring-ring transition hover:bg-muted sm:h-10 sm:rounded-2xl sm:text-sm"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="mt-6 w-full max-w-full overflow-x-auto rounded-2xl ring-1 ring-ring custom-scrollbar bg-card shadow-inner">
                  <div className="min-w-[1040px]">
                    <div className="grid grid-cols-[1.15fr_0.62fr_0.95fr_0.72fr_1.1fr_0.58fr_1.45fr] gap-2 bg-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-subtext border-b border-ring">
                      <div>User</div>
                      <div>Status</div>
                      <div>Withdraw</div>
                      <div>Verify</div>
                      <div>Balances</div>
                      <div>Downline</div>
                      <div className="text-center">Action</div>
                    </div>
                    <div className="divide-y divide-ring/50">
                      {usersLoading ? (
                        <div className="px-4 py-6 text-center text-sm text-subtext">Loading users...</div>
                      ) : null}
                      {users
                        .filter((u) => {
                          if (userStatusFilter === "all") return true;
                          return String(u.status ?? "").toLowerCase() === userStatusFilter.toLowerCase();
                        })
                        .filter((u) => {
                          if (!search.trim()) return true;
                          const s = search.trim().toLowerCase();
                          return (
                            String(u.username ?? "").toLowerCase().includes(s) ||
                            String(u.email ?? "").toLowerCase().includes(s) ||
                            String(u.referrerCode ?? "").toLowerCase().includes(s)
                          );
                        })
                        .map((u) => (
                          <div key={u.id} className="grid grid-cols-[1.15fr_0.62fr_0.95fr_0.72fr_1.1fr_0.58fr_1.45fr] gap-2 px-4 py-4 text-sm transition hover:bg-muted/30">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">{u.username}</div>
                              <div className="truncate text-[10px] text-subtext">{u.email}</div>
                            </div>
                            <div className="flex items-center">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                                  u.status === "active" || u.status === "admin" || u.status === "withdraw_suspend"
                                    ? "bg-[rgba(16,185,129,0.10)] text-foreground ring-[rgba(16,185,129,0.35)]"
                                    : u.status === "inactive"
                                    ? "bg-[rgba(255,106,0,0.10)] text-foreground ring-[rgba(255,106,0,0.35)]"
                                    : "bg-[rgba(239,68,68,0.10)] text-foreground ring-[rgba(239,68,68,0.35)]"
                                }`}
                              >
                                {adminUserAccountStatusLabel(u.status)}
                              </span>
                            </div>
                            <div className="flex items-center min-w-0">
                              {(() => {
                                const w = adminUserWithdrawAccessLabel(u.status);
                                if (w.tone === "na") {
                                  return <span className="text-[10px] text-subtext">{w.text}</span>;
                                }
                                return (
                                  <span
                                    className={`inline-flex max-w-full truncate items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                                      w.tone === "suspend"
                                        ? "bg-[rgba(245,158,11,0.12)] text-foreground ring-[rgba(245,158,11,0.4)]"
                                        : "bg-[rgba(16,185,129,0.10)] text-foreground ring-[rgba(16,185,129,0.35)]"
                                    }`}
                                  >
                                    {w.text}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="flex items-center">
                              {u.verifyStatus === "verified" ? (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 bg-[rgba(16,185,129,0.10)] text-foreground ring-[rgba(16,185,129,0.35)]">
                                  VERIFIED
                                </span>
                              ) : u.verifyStatus === "unverified" ? (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 bg-[rgba(239,68,68,0.10)] text-foreground ring-[rgba(239,68,68,0.35)]">
                                  UNVERIFIED{typeof u.secondsLeft === "number" && u.secondsLeft > 0 ? ` · ${Math.floor(u.secondsLeft / 3600)}h` : ""}
                                </span>
                              ) : u.verifyStatus === "expired" ? (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 bg-[rgba(255,106,0,0.10)] text-foreground ring-[rgba(255,106,0,0.35)]">
                                  EXPIRED
                                </span>
                              ) : (
                                <span className="text-xs text-subtext">—</span>
                              )}
                            </div>
                            <div className="flex min-w-0 flex-col gap-0.5 text-[10px] sm:text-xs leading-tight">
                              <div className="tabular-nums text-foreground">
                                Balance: {toUSD(Number(u.usdtBalance ?? 0))}
                              </div>
                              <div className="tabular-nums text-subtext">
                                Withdraw: {toUSD(Number(u.withdrawBalance ?? 0))}
                              </div>
                            </div>
                            <div className="text-subtext flex items-center">{String(u.downlineCount ?? 0)}</div>
                            <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  const st = String(u?.status ?? "");
                                  setEditingUser(u);
                                  if (st === "blocked") setEditUserAccountStatus("blocked");
                                  else if (st === "inactive") setEditUserAccountStatus("inactive");
                                  else setEditUserAccountStatus("active");
                                  setEditUserWithdrawalAccess(st === "withdraw_suspend" ? "suspend" : "active");
                                }}
                                title="Edit User"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 ring-1 ring-blue-600/20 hover:bg-blue-600 hover:text-white transition"
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                title="Open user dashboard (new tab)"
                                onClick={() => {
                                  setConfirmModal({
                                    message: `Open ${u.username}'s dashboard in a new tab? Your admin session stays on this tab; the other tab uses a secure view token (no logout).`,
                                    confirmLabel: "Open dashboard",
                                    onConfirm: async () => {
                                      setConfirmModal(null);
                                      try {
                                        const res = await fetch("/api/admin/impersonate-token", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ email: u.email }),
                                        });
                                        const data = await res.json();
                                        if (!res.ok) {
                                          toastAdminApiError(data);
                                          return;
                                        }
                                        const token = data?.token as string | undefined;
                                        if (!token) {
                                          toast.error("No token returned");
                                          return;
                                        }
                                        window.open(
                                          `/dashboard?imp=${encodeURIComponent(token)}`,
                                          "_blank",
                                          "noopener,noreferrer",
                                        );
                                      } catch {
                                        toast.error("Failed to open dashboard");
                                      }
                                    },
                                  });
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-green-600/10 text-green-600 ring-1 ring-green-600/20 hover:bg-green-600 hover:text-white transition"
                              >
                                👁
                              </button>
                              {u.status === "admin" ? (
                                <span className="text-[10px] font-medium text-subtext uppercase tracking-wider px-2">Admin</span>
                              ) : (
                                <>
                                  {(u.status === "inactive" || u.status === "blocked") && (
                                    <button
                                      type="button"
                                      disabled={userStatusActivatingId === u.id}
                                      title={u.status === "blocked" ? "Unblock (activate)" : "Activate"}
                                      onClick={() => {
                                        const actionLabel = u.status === "blocked" ? "unblock" : "activate";
                                        setConfirmModal({
                                          message: `You are about to ${actionLabel} ${u.username}. This will allow them to access their account again.`,
                                          confirmLabel: actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1),
                                          onConfirm: async () => {
                                            if (userActivateInFlightRef.current) return;
                                            userActivateInFlightRef.current = true;
                                            setUserStatusActivatingId(u.id);
                                            setConfirmModal(null);
                                            try {
                                              const res = await fetch("/api/admin/users/status", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ id: u.id, status: "active" }),
                                              });
                                              const data = await res.json();
                                              if (!res.ok) {
                                                toastAdminApiError(data);
                                                return;
                                              }
                                              toast.success(u.status === "blocked" ? "User unblocked" : "User activated");
                                              setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: "active" } : x)));
                                            } catch {
                                              toast.error("Update failed");
                                            } finally {
                                              userActivateInFlightRef.current = false;
                                              setUserStatusActivatingId(null);
                                            }
                                          },
                                        });
                                      }}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary hover:text-white transition disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                      ✓
                                    </button>
                                  )}
                                  {u.status !== "blocked" && u.status !== "admin" && (
                                    <button
                                      type="button"
                                      title="Block User"
                                      onClick={() => {
                                        setConfirmModal({
                                          message: `Are you sure you want to block ${u.username}? This will completely restrict their access.`,
                                          confirmLabel: "Block User",
                                          onConfirm: async () => {
                                            setConfirmModal(null);
                                            try {
                                              const res = await fetch("/api/admin/users/status", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ id: u.id, status: "blocked" }),
                                              });
                                              const data = await res.json();
                                              if (!res.ok) {
                                                toastAdminApiError(data);
                                                return;
                                              }
                                              toast.success("User blocked");
                                              setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: "blocked" } : x)));
                                            } catch {
                                              toast.error("Update failed");
                                            }
                                          },
                                        });
                                      }}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/10 text-red-600 ring-1 ring-red-600/20 hover:bg-red-600 hover:text-white transition"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      {!usersLoading &&
                      users
                        .filter((u) => {
                          if (userStatusFilter === "all") return true;
                          return String(u.status ?? "").toLowerCase() === userStatusFilter.toLowerCase();
                        })
                        .filter((u) => {
                          if (!search.trim()) return true;
                          const s = search.trim().toLowerCase();
                          return (
                            String(u.username ?? "").toLowerCase().includes(s) ||
                            String(u.email ?? "").toLowerCase().includes(s) ||
                            String(u.referrerCode ?? "").toLowerCase().includes(s)
                          );
                        }).length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-subtext">No data yet</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {active === "settings" ? (
              <div className="w-full max-w-full overflow-hidden rounded-3xl bg-card p-4 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-6 lg:p-8">
                <div className="text-sm font-semibold">System Settings</div>
                <div className="mt-2 text-sm text-subtext">Update global configurations</div>
                
                <div className="mt-6 p-4 rounded-2xl bg-muted ring-1 ring-ring">
                  <div className="text-sm font-medium mb-4">Support Contact</div>
                  <label className="grid gap-2">
                    <span className="text-xs font-medium text-subtext">WhatsApp Support Number (with country code, e.g., 923001234567)</span>
                    <input
                      value={whatsappNumber}
                      onPaste={() => {
                        settingsDraftDirtyRef.current = true;
                      }}
                      onChange={(e) => {
                        settingsDraftDirtyRef.current = true;
                        setWhatsappNumber(e.target.value);
                      }}
                      className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="923001234567"
                    />
                  </label>
                </div>

                <p className="mt-4 text-xs text-subtext">
                  Deposit receiver (USDT BEP20) is set in server environment: <span className="font-medium text-foreground">RECEIVER_WALLET_ADDRESS</span>.
                </p>

                {levelsMsg ? <div className="mt-4 rounded-2xl bg-card p-4 text-sm text-subtext ring-1 ring-ring">{levelsMsg}</div> : null}
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={async () => {
                      setLevelsMsg("");
                      try {
                        const res = await fetch("/api/admin/settings", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            whatsappNumber: whatsappNumber.trim(),
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setLevelsMsg(typeof data?.error === "string" ? data.error : "Save failed");
                          return;
                        }
                        settingsDraftDirtyRef.current = false;
                        setLevelsMsg("Saved");
                      } catch {
                        setLevelsMsg("Save failed");
                      }
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90 w-full"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : null}

            {active === "roles" && adminFullAccess ? (
              <div className="custom-scrollbar max-h-[min(90vh,calc(100dvh-10rem))] w-full max-w-full overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8">
                <div className="text-sm font-semibold">Admin roles</div>
                <div className="mt-1 text-sm text-subtext">
                  Each role creates one staff admin user. They must sign in at{" "}
                  <span className="font-medium text-foreground">/role</span> with the email and password you set here (the
                  normal home-page login will not work for this account).
                </div>
                <form
                  className="mt-6 grid gap-4 rounded-2xl bg-muted/40 p-4 ring-1 ring-ring"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = newRoleName.trim();
                    if (!name) {
                      toast.error("Enter a role name");
                      return;
                    }
                    const staffName = newStaffName.trim();
                    const staffEmail = newStaffEmail.trim().toLowerCase();
                    const staffPassword = newStaffPassword;
                    if (!staffName || !staffEmail || !staffPassword) {
                      toast.error("Staff name, email, and password are required");
                      return;
                    }
                    if (staffPassword.length < 6) {
                      toast.error("Password must be at least 6 characters");
                      return;
                    }
                    const permissions = ROLE_CHECKBOX_OPTIONS.filter((o) => newRolePerms[o.key]).map((o) => o.key);
                    try {
                      const res = await fetch("/api/admin/roles", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name,
                          permissions,
                          staffName,
                          staffEmail,
                          staffPassword,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        toastAdminApiError(data);
                        return;
                      }
                      toast.success("Role created");
                      setNewRoleName("");
                      setNewStaffName("");
                      setNewStaffEmail("");
                      setNewStaffPassword("");
                      setShowNewStaffPassword(false);
                      setNewRolePerms({});
                      const res2 = await fetch("/api/admin/roles", { cache: "no-store" });
                      const j2 = await res2.json();
                      if (res2.ok && Array.isArray(j2?.roles)) {
                        setRolesList(
                          j2.roles.map(
                            (r: {
                              id: string;
                              name: string;
                              permissions: unknown;
                              _count?: { users: number };
                              users?: { id: string; email: string; username: string; staffPasswordPlain?: string | null }[];
                            }) => ({
                              id: r.id,
                              name: r.name,
                              permissions: Array.isArray(r.permissions)
                                ? r.permissions.filter((x: unknown) => typeof x === "string")
                                : [],
                              _count: r._count,
                              staffUser: r.users?.[0] ?? null,
                            }),
                          ),
                        );
                      }
                    } catch {
                      toast.error("Create failed");
                    }
                  }}
                >
                  <div className="text-xs font-medium text-subtext">New role</div>
                  <input
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Role name (e.g. Support admin)"
                    className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-subtext">Staff name (display)</span>
                      <input
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        placeholder="Full name"
                        className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-subtext">Login email</span>
                      <input
                        type="email"
                        value={newStaffEmail}
                        onChange={(e) => setNewStaffEmail(e.target.value)}
                        placeholder="staff@example.com"
                        className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-subtext">Login password</span>
                    <div className="relative">
                      <input
                        type={showNewStaffPassword ? "text" : "password"}
                        value={newStaffPassword}
                        onChange={(e) => setNewStaffPassword(e.target.value)}
                        placeholder="Enter password"
                        autoComplete="new-password"
                        className="h-11 w-full rounded-2xl bg-background py-2.5 pl-4 pr-12 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewStaffPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext transition hover:text-foreground"
                        aria-label={showNewStaffPassword ? "Hide password" : "Show password"}
                      >
                        {showNewStaffPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ROLE_CHECKBOX_OPTIONS.map((o) => (
                      <label key={o.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(newRolePerms[o.key])}
                          onChange={(ev) =>
                            setNewRolePerms((prev) => ({ ...prev, [o.key]: ev.target.checked }))
                          }
                        />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
                  >
                    Create role
                  </button>
                </form>
                <div className="mt-8 text-sm font-semibold">Existing roles</div>
                {rolesLoading ? (
                  <div className="mt-4 text-sm text-subtext">Loading…</div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {rolesList.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-col gap-4 rounded-2xl bg-muted/30 p-4 ring-1 ring-ring sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div>
                          <div className="font-medium text-foreground">{r.name}</div>
                          {r.staffUser ? (
                            <div className="mt-1 text-xs text-subtext">
                              Login: <span className="text-foreground">{r.staffUser.email}</span> ({r.staffUser.username})
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-subtext">No staff login linked</div>
                          )}
                          <div className="mt-1 text-xs text-subtext">
                            {(r.permissions ?? []).length ? r.permissions.join(", ") : "No sections"}
                          </div>
                          <div className="mt-1 text-xs text-subtext">
                            {r._count?.users ?? 0} admin user(s)
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingRole({
                                id: r.id,
                                name: r.name,
                                permissions: [...r.permissions],
                                staffUser: r.staffUser ?? null,
                              })
                            }
                            className="rounded-full bg-card px-4 py-2 text-xs font-medium text-foreground ring-1 ring-ring transition hover:bg-muted"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`Delete role "${r.name}"? Staff login(s) for this role will be removed.`)) return;
                              try {
                                const res = await fetch(`/api/admin/roles?id=${encodeURIComponent(r.id)}`, {
                                  method: "DELETE",
                                });
                                if (!res.ok) {
                                  const data = await res.json();
                                  toastAdminApiError(data);
                                  return;
                                }
                                toast.success("Role deleted");
                                setRolesList((prev) => prev.filter((x) => x.id !== r.id));
                              } catch {
                                toast.error("Delete failed");
                              }
                            }}
                            className="rounded-full bg-red-600/10 px-4 py-2 text-xs font-medium text-red-600 ring-1 ring-red-600/20 transition hover:bg-red-600 hover:text-white"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {rolesList.length === 0 ? (
                      <div className="text-sm text-subtext">No roles yet. Create one above.</div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {active === "withdrawPending" ? (
                <div className="w-full max-w-full overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Pending Withdrawals</div>
                      <div className="mt-1 text-sm text-subtext">Approve or reject requests</div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/admin/withdrawals", { cache: "no-store" });
                          const data = await res.json();
                          if (res.ok) setPendingWithdrawals(data.items || []);
                        } catch {}
                      }}
                      className="inline-flex items-center justify-center rounded-full bg-card px-5 py-2 text-sm font-medium text-foreground shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] transition hover:bg-muted"
                    >
                      Refresh
                    </button>
                  </div>
                  {withdrawMsg ? <div className="mt-3 rounded-2xl bg-card p-4 text-sm text-subtext ring-1 ring-ring">{withdrawMsg}</div> : null}
                  <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-ring bg-card shadow-inner custom-scrollbar">
                    <div className="min-w-[800px]">
                      <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 bg-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-subtext border-b border-ring">
                        <div>User</div>
                        <div>Amount</div>
                        <div>Address</div>
                        <div className="text-center">Action</div>
                      </div>
                      <div className="divide-y divide-ring/50">
                      {pendingWithdrawals.map((w) => (
                        <div key={w.id} className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 px-4 py-4 text-sm">
                          <div className="min-w-0 text-foreground">
                            <div className="truncate font-medium">{w.user?.username ?? w.userId}</div>
                            <div className="truncate text-xs text-subtext">{w.user?.email ?? "-"}</div>
                          </div>
                          <div className="text-foreground">{String(w.amount)}</div>
                          <div className="break-all text-subtext">{w.address}</div>
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setWithdrawMsg("");
                                setWithdrawApproveHash("");
                                setWithdrawApproveModal({
                                  id: w.id,
                                  username: String(w.user?.username ?? w.userId ?? ""),
                                  email: String(w.user?.email ?? "-"),
                                  amount: String(w.amount ?? ""),
                                  address: String(w.address ?? ""),
                                });
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-primary px-3 py-1 text-xs text-white ring-1 ring-primary/20"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setWithdrawMsg("");
                                try {
                                  const res = await fetch("/api/admin/withdrawals", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ id: w.id, action: "reject" }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) {
                                    setWithdrawMsg(ADMIN_TOAST_GENERIC);
                                    toastAdminApiError(data);
                                    return;
                                  }
                                  setWithdrawMsg("Withdrawal rejected");
                                  toast.success("Withdrawal rejected");
                                  setPendingWithdrawals((prev) => prev.filter((x) => x.id !== w.id));
                                } catch (e) {
                                  console.error("[admin withdraw reject]", e);
                                  setWithdrawMsg(ADMIN_TOAST_GENERIC);
                                  toast.error(ADMIN_TOAST_GENERIC);
                                }
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-card px-3 py-1 text-xs text-foreground ring-1 ring-ring"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {active === "withdrawHistory" ? (
              <div className="w-full max-w-full overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-subtext">Withdraw</div>
                    <div className="mt-1 text-lg font-semibold text-foreground">Withdraw history</div>
                    <div className="mt-1 text-sm text-subtext">
                      Pay by shows who approved or rejected. Staff only see withdrawals they processed; super admin sees all.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchWithdrawHistory(false).catch(() => undefined)}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-card px-5 text-sm font-medium text-foreground ring-1 ring-ring transition hover:bg-muted"
                  >
                    Refresh
                  </button>
                </div>
                {withdrawHistoryLoading ? (
                  <div className="mt-6 px-4 py-8 text-center text-sm text-subtext">Loading…</div>
                ) : (
                  <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-ring bg-card shadow-inner custom-scrollbar">
                    <div className="min-w-[1120px]">
                      <div className="grid grid-cols-[0.9fr_1fr_1fr_0.65fr_0.65fr_0.65fr_0.55fr_1fr] gap-2 bg-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-subtext border-b border-ring">
                        <div>Pay by</div>
                        <div>Time</div>
                        <div>User</div>
                        <div>Net payout</div>
                        <div>Gross</div>
                        <div>Fee</div>
                        <div>Status</div>
                        <div>Address</div>
                      </div>
                      <div className="divide-y divide-ring/50">
                        {withdrawHistoryItems.map((row: any) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[0.9fr_1fr_1fr_0.65fr_0.65fr_0.65fr_0.55fr_1fr] gap-2 px-4 py-3 text-sm"
                          >
                            <div className="font-medium text-foreground" title={String(row.payBy ?? "")}>
                              {row.payBy != null && row.payBy !== "" ? row.payBy : "—"}
                            </div>
                            <div className="text-xs text-subtext">{new Date(row.at).toLocaleString()}</div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{row.user?.username}</div>
                              <div className="truncate text-xs text-subtext">{row.user?.email}</div>
                            </div>
                            <div>{toUSD(Number(row.netPayout))}</div>
                            <div className="text-subtext">
                              {row.grossRequested != null ? toUSD(row.grossRequested) : "—"}
                            </div>
                            <div className="text-subtext">
                              {row.feeAmount != null ? toUSD(row.feeAmount) : "—"}
                            </div>
                            <div className="text-xs">{row.status}</div>
                            <div className="break-all text-xs text-subtext">{row.address}</div>
                          </div>
                        ))}
                        {withdrawHistoryItems.length === 0 && (
                          <div className="px-4 py-8 text-center text-sm text-subtext">No data yet</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {active === "deposits" ? (
                <div className="w-full max-w-full overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Deposits</div>
                      <div className="mt-1 text-sm text-subtext">Latest deposit records</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={depositStatus}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setDepositStatus(val);
                          try {
                            const q = val === "all" ? "" : `?status=${encodeURIComponent(val)}`;
                            const res = await fetch(`/api/admin/deposits${q}`, { cache: "no-store" });
                            const data = await res.json();
                            if (res.ok) setDeposits(data.items || []);
                          } catch {}
                        }}
                        className="h-10 rounded-2xl bg-background px-3 text-sm text-foreground ring-1 ring-ring"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const q = depositStatus === "all" ? "" : `?status=${encodeURIComponent(depositStatus)}`;
                            const res = await fetch(`/api/admin/deposits${q}`, { cache: "no-store" });
                            const data = await res.json();
                            if (res.ok) setDeposits(data.items || []);
                          } catch {}
                        }}
                        className="inline-flex items-center justify-center rounded-full bg-card px-5 py-2 text-sm font-medium text-foreground shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] transition hover:bg-muted"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                  <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-ring bg-card shadow-inner custom-scrollbar">
                    <div className="min-w-[800px]">
                      <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 bg-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-subtext border-b border-ring">
                        <div>Hash</div>
                        <div>User</div>
                        <div>Amount</div>
                        <div className="text-center">Status</div>
                      </div>
                      <div className="divide-y divide-ring/50">
                      {deposits.map((d) => (
                        <div key={d.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 px-4 py-4 text-sm">
                          <div className="truncate">{d.txHash}</div>
                          <div className="truncate">{d.user?.username ?? d.userId}</div>
                          <div className="font-medium text-foreground">{String(d.amount)}</div>
                          <div className={`text-xs`}>
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                                d.status === "confirmed"
                                  ? "bg-[rgba(16,185,129,0.10)] text-foreground ring-[rgba(16,185,129,0.35)]"
                                  : d.status === "pending"
                                  ? "bg-[rgba(255,193,7,0.10)] text-foreground ring-[rgba(255,193,7,0.35)]"
                                  : "bg-[rgba(239,68,68,0.10)] text-foreground ring-[rgba(239,68,68,0.35)]"
                              }`}
                            >
                              {d.status}
                            </span>
                          </div>
                        </div>
                      ))}
                      {deposits.length === 0 && (
                        <div className="px-4 py-6 text-center text-sm text-subtext">No deposits</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {active === "payments" ? (
              <div className="w-full max-w-full overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-subtext">Payment History</div>
                    <div className="mt-1 text-lg font-semibold text-foreground">{paymentHistoryKindLabel[paymentHistoryKind]}</div>
                    <div className="mt-1 text-sm text-subtext">
                      Deposits, commissions, charity & fee pool — pick a tab in the sidebar (withdrawal history is under Withdraw)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchPaymentHistory(false).catch(() => undefined)}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-card px-5 text-sm font-medium text-foreground ring-1 ring-ring transition hover:bg-muted"
                  >
                    Refresh
                  </button>
                </div>
                {paymentHistoryLoading ? (
                  <div className="mt-6 px-4 py-8 text-center text-sm text-subtext">Loading…</div>
                ) : (
                  <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-ring bg-card shadow-inner custom-scrollbar">
                    {paymentHistoryKind === "deposits" && (
                      <div className="min-w-[900px]">
                        <div className="grid grid-cols-[1.1fr_1fr_0.75fr_0.75fr_1fr] gap-2 bg-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-subtext border-b border-ring">
                          <div>Time</div>
                          <div>User</div>
                          <div>Amount</div>
                          <div>Status</div>
                          <div>Tx hash</div>
                        </div>
                        <div className="divide-y divide-ring/50">
                          {paymentHistoryItems.map((row: any) => (
                            <div key={row.id} className="grid grid-cols-[1.1fr_1fr_0.75fr_0.75fr_1fr] gap-2 px-4 py-3 text-sm">
                              <div className="text-xs text-subtext">{new Date(row.at).toLocaleString()}</div>
                              <div className="min-w-0">
                                <div className="truncate font-medium">{row.user?.username}</div>
                                <div className="truncate text-xs text-subtext">{row.user?.email}</div>
                              </div>
                              <div className="font-medium">{toUSD(Number(row.amount))}</div>
                              <div className="text-xs">{row.status}</div>
                              <div className="break-all font-mono text-xs text-subtext">{row.txHash}</div>
                            </div>
                          ))}
                          {paymentHistoryItems.length === 0 && (
                            <div className="px-4 py-8 text-center text-sm text-subtext">No data yet</div>
                          )}
                        </div>
                      </div>
                    )}
                    {paymentHistoryKind === "commissions" && (
                      <div className="min-w-[900px]">
                        <div className="grid grid-cols-[1.05fr_1.35fr_1.1fr_0.8fr_1.2fr] gap-2 bg-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-subtext border-b border-ring">
                          <div>Time</div>
                          <div>From (source)</div>
                          <div>Breakdown</div>
                          <div>Total</div>
                          <div>Note</div>
                        </div>
                        <div className="divide-y divide-ring/50">
                          {paymentHistoryItems.map((row: any) => (
                            <div key={row.id} className="grid grid-cols-[1.05fr_1.35fr_1.1fr_0.8fr_1.2fr] gap-2 px-4 py-3 text-sm">
                              <div className="text-xs text-subtext whitespace-nowrap">{new Date(row.at).toLocaleString()}</div>
                              <div className="min-w-0 truncate text-sm" title={`${row.fromUser?.username ?? ""} · ${row.fromUser?.email ?? ""}`}>
                                <span className="font-medium text-foreground">{row.fromUser?.username ?? "—"}</span>
                                <span className="text-subtext"> · {row.fromUser?.email ?? ""}</span>
                              </div>
                              <div className="min-w-0 text-xs text-subtext leading-snug">{row.breakdown ?? (row.level != null ? `L${row.level}` : "—")}</div>
                              <div className="font-medium text-primary whitespace-nowrap">{toUSD(Number(row.amount))}</div>
                              <div className="min-w-0 truncate text-xs text-subtext" title={row.note}>
                                {row.note || "—"}
                              </div>
                            </div>
                          ))}
                          {paymentHistoryItems.length === 0 && (
                            <div className="px-4 py-8 text-center text-sm text-subtext">No admin commission records</div>
                          )}
                        </div>
                      </div>
                    )}
                    {paymentHistoryKind === "charity" && (
                      <div className="min-w-[900px]">
                        <div className="grid grid-cols-[1fr_1fr_0.75fr_0.75fr_0.75fr_0.6fr] gap-2 bg-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-subtext border-b border-ring">
                          <div>Time</div>
                          <div>User (withdrawal)</div>
                          <div>Charity share</div>
                          <div>Total fee</div>
                          <div>Gross req.</div>
                          <div>WD status</div>
                        </div>
                        <div className="divide-y divide-ring/50">
                          {paymentHistoryItems.map((row: any) => (
                            <div key={row.id} className="grid grid-cols-[1fr_1fr_0.75fr_0.75fr_0.75fr_0.6fr] gap-2 px-4 py-3 text-sm">
                              <div className="text-xs text-subtext">{new Date(row.at).toLocaleString()}</div>
                              <div className="min-w-0">
                                <div className="truncate font-medium">{row.user?.username}</div>
                                <div className="truncate text-xs text-subtext">{row.user?.email}</div>
                              </div>
                              <div className="font-medium">{toUSD(Number(row.amount))}</div>
                              <div className="text-subtext">
                                {row.feeAmount != null ? toUSD(row.feeAmount) : "—"}
                              </div>
                              <div className="text-subtext">
                                {row.grossRequested != null ? toUSD(row.grossRequested) : "—"}
                              </div>
                              <div className="text-xs">{row.withdrawalStatus}</div>
                            </div>
                          ))}
                          {paymentHistoryItems.length === 0 && (
                            <div className="px-4 py-8 text-center text-sm text-subtext">
                              No charity rows yet (logged when users request withdrawals after fee split is stored)
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {paymentHistoryKind === "fee" && (
                      <div className="min-w-[900px]">
                        <div className="grid grid-cols-[1fr_1fr_0.75fr_0.75fr_0.75fr_0.6fr] gap-2 bg-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-subtext border-b border-ring">
                          <div>Time</div>
                          <div>User (withdrawal)</div>
                          <div>Fee pool share</div>
                          <div>Total fee</div>
                          <div>Charity share</div>
                          <div>WD status</div>
                        </div>
                        <div className="divide-y divide-ring/50">
                          {paymentHistoryItems.map((row: any) => (
                            <div key={row.id} className="grid grid-cols-[1fr_1fr_0.75fr_0.75fr_0.75fr_0.6fr] gap-2 px-4 py-3 text-sm">
                              <div className="text-xs text-subtext">{new Date(row.at).toLocaleString()}</div>
                              <div className="min-w-0">
                                <div className="truncate font-medium">{row.user?.username}</div>
                                <div className="truncate text-xs text-subtext">{row.user?.email}</div>
                              </div>
                              <div className="font-medium">{toUSD(Number(row.amount))}</div>
                              <div className="text-subtext">
                                {row.feeAmount != null ? toUSD(row.feeAmount) : "—"}
                              </div>
                              <div className="text-subtext">
                                {row.charityAmount != null ? toUSD(row.charityAmount) : "—"}
                              </div>
                              <div className="text-xs">{row.withdrawalStatus}</div>
                            </div>
                          ))}
                          {paymentHistoryItems.length === 0 && (
                            <div className="px-4 py-8 text-center text-sm text-subtext">
                              No fee-pool rows yet (same as charity — from withdrawal fee splits)
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {active === "overview" ? (
              <div className="w-full max-w-full overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Admin Tree</div>
                    <div className="mt-1 text-xs text-subtext leading-relaxed sm:text-sm">
                      Company root with full downline <br className="sm:hidden" />
                      (tree L1–{TREE_QUERY_MAX_DEPTH} · commissions L1–20)
                    </div>
                  </div>
                  <div className="text-xs font-medium text-primary sm:text-sm">
                    {adminTreeNodes.filter((n) => Number(n.depth) > 0).length} downline
                  </div>
                </div>
                <div className="mt-6 max-h-[380px] overflow-auto rounded-2xl ring-1 ring-ring custom-scrollbar">
                  <div className="divide-y divide-[color:var(--ring)]">
                    {adminTreeNodes.slice(0, 200).map((n: any) => (
                      <div key={n.id} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 text-sm">
                        <div className="min-w-0 truncate">
                          <div className="font-medium text-foreground">{n.username}</div>
                          <div className="text-xs text-subtext">{formatAdminTreeLevelLabel(n.depth)} · {n.referrerCode}</div>
                        </div>
                        <div className="max-w-[45%] truncate text-xs text-subtext">{n.email}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-6">
                  <div className="text-sm font-semibold">Admin Network Tree</div>
                  <div className="mt-2 text-sm text-subtext">Visual network graph</div>
                  <NetworkTreeAdmin nodes={adminTreeNodes} origin={origin} onCopyMessage={setAdminUiMsg} />
                  {adminUiMsg ? (
                    <div className="mt-4 rounded-2xl bg-muted p-4 text-xs text-subtext ring-1 ring-ring">{adminUiMsg}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/30"
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 h-full w-[84%] max-w-xs bg-card shadow-xl ring-1 ring-ring">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="text-sm font-semibold">Admin Menu</div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-ring hover:bg-secondary"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="px-3 pb-4">
              {visibleNavItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActive(item.key as AdminNavKey);
                    setPaymentHistoryOpen(false);
                    setWithdrawSectionOpen(false);
                    setMobileNavOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    active === item.key ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{item.label}</span>
                  {active === item.key ? <span className="text-primary">●</span> : null}
                </button>
              ))}
              {canAdminSection("withdrawals") || canAdminSection("payments") ? (
                <div className="mt-1 grid gap-1">
                  <button
                    type="button"
                    onClick={() => setWithdrawSectionOpen((v) => !v)}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                      active === "withdrawPending" || active === "withdrawHistory"
                        ? "bg-muted text-foreground"
                        : "text-subtext hover:bg-muted hover:text-foreground"
                    }`}
                    aria-expanded={withdrawSectionOpen}
                  >
                    <span>Withdraw</span>
                    <span className={`transition-transform ${withdrawSectionOpen ? "rotate-90" : ""}`}>›</span>
                  </button>
                  <div
                    className={`ml-2 grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${
                      withdrawSectionOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden rounded-2xl bg-background ring-1 ring-ring">
                      {canAdminSection("withdrawals") ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActive("withdrawPending");
                            setWithdrawSectionOpen(true);
                            setPaymentHistoryOpen(false);
                            setMobileNavOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                            active === "withdrawPending"
                              ? "bg-muted text-foreground"
                              : "text-subtext hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span>Pending withdrawals</span>
                          {active === "withdrawPending" ? <span className="text-primary">●</span> : null}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setActive("withdrawHistory");
                          setWithdrawSectionOpen(true);
                          setPaymentHistoryOpen(false);
                          setMobileNavOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                          active === "withdrawHistory"
                            ? "bg-muted text-foreground"
                            : "text-subtext hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <span>Withdraw history</span>
                        {active === "withdrawHistory" ? <span className="text-primary">●</span> : null}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {canAdminSection("payments") ? (
              <div className="mt-1 grid gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentHistoryOpen((v) => !v);
                    setWithdrawSectionOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    active === "payments" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                  }`}
                  aria-expanded={paymentHistoryOpen}
                >
                  <span>Payment History</span>
                  <span className={`transition-transform ${paymentHistoryOpen ? "rotate-90" : ""}`}>›</span>
                </button>
                <div
                  className={`ml-2 grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${
                    paymentHistoryOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden rounded-2xl bg-background ring-1 ring-ring">
                    {PAYMENT_HISTORY_SUB.map((sub) => (
                      <button
                        key={sub.key}
                        type="button"
                        onClick={() => openPaymentSub(sub.key)}
                        className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                          active === "payments" && paymentHistoryKind === sub.key
                            ? "bg-muted text-foreground"
                            : "text-subtext hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <span>{sub.label}</span>
                        {active === "payments" && paymentHistoryKind === sub.key ? (
                          <span className="text-primary">●</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {editingRole ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setEditingRole(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-ring">
            <div className="border-b border-ring bg-muted/30 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Edit role</h3>
                <button
                  type="button"
                  onClick={() => setEditingRole(null)}
                  className="rounded-xl p-2 hover:bg-muted transition text-subtext"
                >
                  ✕
                </button>
              </div>
            </div>
            <form
              className="flex flex-col"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = editRoleName.trim();
                if (!name) {
                  toast.error("Enter a name");
                  return;
                }
                const permissions = ROLE_CHECKBOX_OPTIONS.filter((o) => editRolePerms[o.key]).map((o) => o.key);
                const payload: Record<string, unknown> = { id: editingRole.id, name, permissions };
                if (editingRole.staffUser) {
                  const u = editStaffUsername.trim();
                  const em = editStaffEmail.trim().toLowerCase();
                  if (!u) {
                    toast.error("Enter staff display name / username");
                    return;
                  }
                  if (!em) {
                    toast.error("Enter staff login email");
                    return;
                  }
                  payload.staffUsername = u;
                  payload.staffEmail = em;
                  const newPwd = editStaffNewPassword.trim();
                  if (newPwd) {
                    if (newPwd.length < 6) {
                      toast.error("Password kam az kam 6 characters");
                      return;
                    }
                    payload.staffPassword = newPwd;
                  }
                }
                try {
                  const res = await fetch("/api/admin/roles", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    toastAdminApiError(data);
                    return;
                  }
                  toast.success("Role updated");
                  const nextStaff =
                    data?.staffUser && typeof data.staffUser === "object"
                      ? (data.staffUser as {
                          id: string;
                          email: string;
                          username: string;
                          staffPasswordPlain?: string | null;
                        })
                      : editingRole.staffUser;
                  setRolesList((prev) =>
                    prev.map((x) =>
                      x.id === editingRole.id
                        ? { ...x, name, permissions, staffUser: nextStaff ?? x.staffUser }
                        : x,
                    ),
                  );
                  setEditingRole(null);
                } catch {
                  toast.error("Update failed");
                }
              }}
            >
              <div className="custom-scrollbar max-h-[min(70vh,calc(90vh-11rem))] space-y-4 overflow-y-auto overflow-x-hidden px-6 py-4">
              <label className="block">
                <span className="text-xs font-medium text-subtext">Role name</span>
                <input
                  value={editRoleName}
                  onChange={(e) => setEditRoleName(e.target.value)}
                  className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                />
              </label>
              {editingRole.staffUser ? (
                <div className="rounded-2xl bg-muted/30 p-4 ring-1 ring-ring">
                  <div className="text-xs font-semibold text-foreground">Staff login (/role)</div>
                  <label className="mt-3 block">
                    <span className="text-xs font-medium text-subtext">Username (display name)</span>
                    <input
                      value={editStaffUsername}
                      onChange={(e) => setEditStaffUsername(e.target.value)}
                      autoComplete="off"
                      className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                    />
                  </label>
                  <label className="mt-2 block">
                    <span className="text-xs font-medium text-subtext">Login email</span>
                    <input
                      type="email"
                      value={editStaffEmail}
                      onChange={(e) => setEditStaffEmail(e.target.value)}
                      autoComplete="off"
                      className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="text-xs font-medium text-subtext">Current password</span>
                    <div className="mt-1.5">
                      {editingRole.staffUser?.staffPasswordPlain ? (
                        <input
                          readOnly
                          type="password"
                          value={editingRole.staffUser.staffPasswordPlain}
                          autoComplete="off"
                          className="w-full cursor-default rounded-2xl bg-muted/40 px-4 py-2.5 text-sm text-foreground ring-1 ring-ring outline-none"
                        />
                      ) : (
                        <input
                          readOnly
                          tabIndex={-1}
                          value="••••••••••••"
                          className="w-full cursor-default rounded-2xl bg-muted/50 px-4 py-2.5 font-mono text-sm tracking-[0.15em] text-foreground ring-1 ring-ring outline-none"
                          aria-label="Current password"
                        />
                      )}
                    </div>
                  </label>
                  <label className="mt-3 block">
                    <span className="text-xs font-medium text-subtext">Change password (optional)</span>
                    <div className="relative mt-1.5">
                      <input
                        type={showEditStaffPassword ? "text" : "password"}
                        value={editStaffNewPassword}
                        onChange={(e) => setEditStaffNewPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder="Enter new password"
                        className="w-full rounded-2xl bg-background py-2.5 pl-4 pr-12 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditStaffPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext transition hover:text-foreground"
                        aria-label={showEditStaffPassword ? "Hide new password" : "Show new password"}
                      >
                        {showEditStaffPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                </div>
              ) : (
                <p className="rounded-2xl bg-muted/20 p-3 text-xs text-subtext ring-1 ring-ring">
                  No staff account is linked to this role. Only role name and permissions can be edited here.
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLE_CHECKBOX_OPTIONS.map((o) => (
                  <label key={o.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(editRolePerms[o.key])}
                      onChange={(ev) =>
                        setEditRolePerms((prev) => ({ ...prev, [o.key]: ev.target.checked }))
                      }
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
              </div>
              <div className="flex shrink-0 justify-end gap-3 border-t border-ring bg-card px-6 py-4">
                <button
                  type="button"
                  onClick={() => setEditingRole(null)}
                  className="rounded-full bg-muted px-6 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 transition shadow-lg shadow-primary/20"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setEditingUser(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-ring">
            <div className="border-b border-ring bg-muted/30 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Manage User: {editingUser.username}</h3>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl p-2 hover:bg-muted transition text-subtext"
                >
                  ✕
                </button>
              </div>
            </div>
            <form
              key={editingUser.id}
              className="flex flex-col"
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newPwd = String(formData.get("newPassword") ?? "").trim();
                if (newPwd.length > 0 && newPwd.length < 6) {
                  toast.error("New password must be at least 6 characters");
                  return;
                }
                const data: Record<string, unknown> = {
                  id: editingUser.id,
                  username: String(formData.get("username") ?? "").trim(),
                  email: String(formData.get("email") ?? "").trim(),
                  phone: String(formData.get("phone") ?? "").trim(),
                  country: String(formData.get("country") ?? "").trim(),
                  withdrawBalance: formData.get("withdrawBalance"),
                  usdtBalance: formData.get("usdtBalance"),
                  securityCode: String(formData.get("securityCode") ?? "").trim(),
                  permanentWithdrawAddress: String(formData.get("permanentWithdrawAddress") ?? "")
                    .trim()
                    .replace(/\s+/g, ""),
                };
                if (editingUser.status === "admin") {
                  data.status = "admin";
                } else if (editUserAccountStatus === "blocked") {
                  data.status = "blocked";
                } else if (editUserAccountStatus === "inactive") {
                  data.status = "inactive";
                } else {
                  data.status = editUserWithdrawalAccess === "suspend" ? "withdraw_suspend" : "active";
                }
                if (newPwd.length > 0) {
                  data.newPassword = newPwd;
                }
                if (adminFullAccess) {
                  const ar = formData.get("adminRoleId");
                  data.adminRoleId = ar === "" || ar == null ? null : String(ar);
                }
                const addrRaw = String(data.permanentWithdrawAddress ?? "").trim();
                if (addrRaw.length > 0 && !BEP20_USDT_ADDRESS_RE.test(addrRaw)) {
                  toast.error(INVALID_BEP20_WITHDRAW_MSG);
                  return;
                }
                try {
                  const res = await fetch("/api/admin/users/update", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                  });
                  const json = (await res.json()) as { error?: string };
                  if (!res.ok) {
                    console.error("[admin user update]", res.status, json);
                    if (json?.error === "INVALID_ADDRESS") {
                      toast.error(INVALID_BEP20_WITHDRAW_MSG);
                      return;
                    }
                    if (json?.error === "VALIDATION") {
                      toast.error("Please check username, email, and required fields.");
                      return;
                    }
                    toast.error(ADMIN_TOAST_GENERIC);
                    return;
                  }
                  toast.success("User updated successfully");
                  setEditingUser(null);
                  fetchAdminUsers().catch(() => undefined);
                } catch (err) {
                  toast.error("An error occurred");
                }
              }}
            >
              <div className="custom-scrollbar max-h-[min(70vh,calc(90vh-11rem))] overflow-y-auto overflow-x-hidden px-6 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-subtext">Username</span>
                  <input
                    name="username"
                    defaultValue={editingUser.username}
                    className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-subtext">Email</span>
                  <input
                    name="email"
                    type="email"
                    defaultValue={editingUser.email}
                    className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-subtext">Phone</span>
                  <input
                    name="phone"
                    defaultValue={editingUser.phone}
                    className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-subtext">Country</span>
                  <input
                    name="country"
                    defaultValue={editingUser.country}
                    className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-subtext">Balance ($)</span>
                  <input
                    name="usdtBalance"
                    type="number"
                    step="0.01"
                    readOnly={!adminFullAccess}
                    defaultValue={editingUser.usdtBalance || 0}
                    className={
                      "mt-1 block w-full rounded-2xl px-4 py-2 text-sm ring-1 ring-ring outline-none " +
                      (adminFullAccess
                        ? "bg-background text-foreground focus:ring-2 focus:ring-primary/30"
                        : "cursor-not-allowed bg-muted/60 text-foreground")
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-subtext">Withdraw wallet ($)</span>
                  <input
                    name="withdrawBalance"
                    type="number"
                    step="0.01"
                    readOnly={!adminFullAccess}
                    defaultValue={editingUser.withdrawBalance || 0}
                    className={
                      "mt-1 block w-full rounded-2xl px-4 py-2 text-sm ring-1 ring-ring outline-none " +
                      (adminFullAccess
                        ? "bg-background text-foreground focus:ring-2 focus:ring-primary/30"
                        : "cursor-not-allowed bg-muted/60 text-foreground")
                    }
                  />
                </label>
                {!adminFullAccess ? (
                  <p className="text-[11px] text-subtext sm:col-span-2">
                    Balance ($) and Withdraw wallet ($) are view only for role staff — only full admin can change them.
                  </p>
                ) : null}
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-subtext">Withdrawal Address (USDT BEP20)</span>
                  <input
                    name="permanentWithdrawAddress"
                    defaultValue={editingUser.permanentWithdrawAddress || ""}
                    autoComplete="off"
                    className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm font-mono text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                    placeholder="0x followed by 40 hex characters"
                  />
                  <p className="mt-1 text-[11px] text-subtext">
                    Same format as user profile: BEP20 address only (no spaces). Leave empty to clear.
                  </p>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-subtext">Security Code</span>
                  <input
                    name="securityCode"
                    defaultValue={editingUser.securityCode}
                    className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                  />
                </label>
                <div className="block sm:col-span-2">
                  <span className="text-xs font-medium text-subtext">New password (optional)</span>
                  <div className="relative mt-1">
                    <input
                      name="newPassword"
                      type={showEditUserNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Leave blank to keep current password"
                      className="w-full rounded-2xl bg-background py-2 pl-4 pr-12 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditUserNewPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext transition hover:text-foreground"
                      aria-label={showEditUserNewPassword ? "Hide new password" : "Show new password"}
                    >
                      {showEditUserNewPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {editingUser.status === "admin" ? (
                  <div className="block sm:col-span-2">
                    <span className="text-xs font-medium text-subtext">Status</span>
                    <p className="mt-1 rounded-2xl bg-muted/40 px-4 py-2.5 text-sm text-foreground ring-1 ring-ring">
                      Admin — staff accounts are managed from the Roles tab; status is not changed here.
                    </p>
                  </div>
                ) : (
                  <>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-subtext">Status</span>
                      <select
                        value={editUserAccountStatus}
                        onChange={(e) =>
                          setEditUserAccountStatus(e.target.value as "active" | "inactive" | "blocked")
                        }
                        className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive (not activated)</option>
                        <option value="blocked">Blocked</option>
                      </select>
                      {editingUser.status === "inactive" ? (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                          This user is currently inactive. Saving with Active will activate them (same as the Activate button).
                        </p>
                      ) : null}
                    </label>
                    {editUserAccountStatus === "active" ? (
                      <label className="block sm:col-span-2">
                        <span className="text-xs font-medium text-subtext">Withdrawal</span>
                        <select
                          value={editUserWithdrawalAccess}
                          onChange={(e) => setEditUserWithdrawalAccess(e.target.value as "active" | "suspend")}
                          className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                        >
                          <option value="active">Withdraw active</option>
                          <option value="suspend">Withdrawal suspend</option>
                        </select>
                        <p className="mt-1 text-[11px] text-subtext">
                          Withdraw active: user can request withdrawals. Withdrawal suspend: withdrawals locked (same as before).
                        </p>
                      </label>
                    ) : null}
                  </>
                )}
                {adminFullAccess && editingUser.status === "admin" ? (
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-subtext">Admin role (restrict panel sections)</span>
                    <select
                      name="adminRoleId"
                      defaultValue={editingUser.adminRoleId ?? ""}
                      className="mt-1 block w-full rounded-2xl bg-background px-4 py-2 text-sm text-foreground ring-1 ring-ring focus:ring-2 focus:ring-primary/30 outline-none"
                    >
                      <option value="">Full access (no role restriction)</option>
                      {adminRolesForSelect.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-ring bg-card px-6 py-4">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-full bg-muted px-6 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 transition shadow-lg shadow-primary/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {withdrawApproveModal && (
        <WithdrawApproveModal
          username={withdrawApproveModal.username}
          email={withdrawApproveModal.email}
          netAmount={withdrawApproveModal.amount}
          address={withdrawApproveModal.address}
          txHash={withdrawApproveHash}
          onTxHashChange={setWithdrawApproveHash}
          loading={withdrawApproveLoading}
          onCancel={() => {
            if (!withdrawApproveLoading) {
              setWithdrawApproveModal(null);
              setWithdrawApproveHash("");
            }
          }}
          onConfirm={async () => {
            const txHash = withdrawApproveHash.trim();
            if (!txHash || !withdrawApproveModal) return;
            setWithdrawApproveLoading(true);
            try {
              const res = await fetch("/api/admin/withdrawals", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: withdrawApproveModal.id,
                  action: "approve",
                  txHash,
                }),
              });
              const data = await res.json();
              if (!res.ok) {
                setWithdrawMsg(ADMIN_TOAST_GENERIC);
                toastAdminApiError(data);
                return;
              }
              setWithdrawMsg("Withdrawal approved");
              toast.success("Withdrawal approved");
              setPendingWithdrawals((prev) => prev.filter((x) => x.id !== withdrawApproveModal.id));
              setWithdrawApproveModal(null);
              setWithdrawApproveHash("");
            } catch (e) {
              console.error("[admin withdraw approve]", e);
              setWithdrawMsg(ADMIN_TOAST_GENERIC);
              toast.error(ADMIN_TOAST_GENERIC);
            } finally {
              setWithdrawApproveLoading(false);
            }
          }}
        />
      )}

      {confirmModal && (
        <ConfirmationModal
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}
