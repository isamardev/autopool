"use client";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { FaFacebook, FaTwitter, FaInstagram, FaYoutube, FaTelegramPlane, FaWhatsapp, FaCog, FaSignOutAlt, FaUserCircle, FaEye, FaEyeSlash } from "react-icons/fa";
import { toast } from "react-toastify";
import WhatsAppButton from "@/components/WhatsAppButton";
import { WHATSAPP_CHANNEL_URL } from "@/lib/support-links";
import { DEFAULT_RECEIVER_WALLET_ADDRESS, RECEIVER_WALLET_NETWORK, RECEIVER_WALLET_TOKEN } from "@/lib/receiver-wallet";
import {
  MIN_DEPOSIT_USDT,
  MIN_WITHDRAW_OR_P2P_USDT,
  WITHDRAW_FEE_PERCENT,
  withdrawNetAfterFee,
} from "@/lib/wallet-limits";
import { TREE_QUERY_MAX_DEPTH } from "@/lib/tree-display";
import { IMPERSONATION_STORAGE_KEY } from "@/lib/session-tab";
import { isActivatedMemberStatus } from "@/lib/user-status";
import { copyTextToClipboard } from "@/lib/copy-text";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";
import { UserWithdrawSection, UserProfileSection } from "@/components/user-panel-forms";
import { NetworkTree, formatUserTreeLevelLabel } from "@/components/NetworkTree";

const COMPANY_ADMIN_EMAIL = "admin@example.com";

const toUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );

/** Match server `normalizeTransactionHashInput` — safe for client-only (no DB imports). */
function normalizeDepositTxHashInput(raw: string): string {
  const t = String(raw)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .trim();
  const noSpace = t.replace(/\s+/g, "");
  if (/^0x[a-fA-F0-9]{64}$/.test(noSpace)) return noSpace.toLowerCase();
  if (/^[a-fA-F0-9]{64}$/.test(noSpace)) return `0x${noSpace.toLowerCase()}`;
  return noSpace;
}

function WalletSection({
  balance,
  userId,
  receiverWalletAddress,
  onHistoryRedirect,
}: {
  balance: number;
  userId: string;
  receiverWalletAddress: string;
  onHistoryRedirect?: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [depositTxId, setDepositTxId] = useState("");
  const [verifyingTx, setVerifyingTx] = useState(false);
  const [verifiedAmount, setVerifiedAmount] = useState<number | null>(null);

  return (
    <div className="rounded-3xl bg-card p-4 sm:p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.38fr]">
        {step === 1 ? (
          <div className="w-full">
            <div className="text-lg font-semibold">Deposit Funds</div>
            <div className="mt-1 text-xs text-subtext">Send USDT on BEP20, then submit your TX ID for verification</div>
            <div className="mt-4 grid gap-3 max-w-full lg:max-w-md">
              <label className="grid gap-1">
                <span className="text-xs text-subtext">Select Network</span>
                <select
                  disabled
                  className="h-10 w-full cursor-not-allowed rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring"
                  value="bep20"
                  onChange={() => {}}
                >
                  <option value="bep20">BEP20 (BSC)</option>
                </select>
              </label>
              <div className="rounded-2xl bg-muted p-3 text-xs text-subtext ring-1 ring-ring">
                Minimum deposit is{" "}
                <span className="font-semibold text-foreground">
                  {MIN_DEPOSIT_USDT} {RECEIVER_WALLET_TOKEN}
                </span>
                . The
                amount will be read from the blockchain after you submit the TX ID.
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep(2);
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full">
            <div className="text-lg font-semibold">Payment Details</div>
            <div className="mt-1 text-xs text-subtext leading-relaxed">
              Minimum <span className="font-semibold text-foreground">${MIN_DEPOSIT_USDT} USDT</span>. Complete your transfer within{" "}
              <span className="font-semibold text-foreground">24 hours</span> from any exchange or wallet to the BEP20 (BSC)
              address below. A valid <span className="font-semibold text-foreground">transaction ID (TX ID)</span> must be
              submitted — without it we cannot verify your payment and{" "}
              <span className="font-semibold text-foreground">we are not responsible</span> for missing or incorrect TX IDs.
            </div>
            <div className="mt-4 grid gap-3">
              <img
                alt="Deposit QR"
                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
                  receiverWalletAddress,
                )}&size=180x180&margin=0`}
                className="mx-auto h-[160px] w-[160px] rounded-lg ring-1 ring-ring"
              />
              <div className="grid min-w-0 gap-2">
                <div className="text-xs font-medium text-subtext">Receiver Address</div>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
                  <div className="min-w-0 flex-1 cursor-text select-all overflow-hidden break-all rounded-2xl bg-background p-3 text-xs font-mono leading-relaxed ring-1 ring-ring sm:text-sm">
                    {receiverWalletAddress}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyTextToClipboard(receiverWalletAddress);
                      if (ok) toast.success("Address copied");
                      else toast.error("Copy failed — long-press the address to copy manually");
                    }}
                    className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-2xl bg-card px-3 text-xs font-medium text-foreground ring-1 ring-ring transition hover:bg-muted sm:w-auto sm:self-stretch"
                    aria-label="Copy address"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="rounded-2xl bg-muted p-3 text-xs text-subtext ring-1 ring-ring">
                TX ID is required — we verify on-chain that USDT reached this deposit address. The member who submits the TX ID
                receives the credit (the same TX cannot be used twice for another account).
              </div>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-subtext">Enter TX ID</span>
                <input
                  type="text"
                  name="depositTxHash"
                  value={depositTxId}
                  onChange={(e) => setDepositTxId(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  className="h-11 w-full rounded-2xl bg-background px-4 text-sm font-mono text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Enter BEP20 transaction ID (0x…)"
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-card px-5 text-sm font-medium text-foreground shadow-sm ring-1 ring-ring transition hover:bg-muted"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={verifyingTx}
                  onClick={async () => {
                    const txId = normalizeDepositTxHashInput(depositTxId);
                    if (!/^0x[a-fA-F0-9]{64}$/.test(txId)) {
                      toast.error("Please enter valid TX ID.");
                      return;
                    }
                    setVerifyingTx(true);
                    try {
                      const res = await fetch("/api/verify-deposit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ transactionHash: txId, userId }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        const msg = typeof data?.error === "string" ? data.error : "Please enter valid TX ID.";
                        toast.error(msg);
                        return;
                      }
                      const amount = Number(data?.amount ?? 0);
                      if (Number.isFinite(amount) && amount > 0) {
                        setVerifiedAmount(amount);
                      }
                      setDepositTxId("");
                      toast.success("Deposit verified successfully");
                      try {
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new Event("deposit:updated"));
                        }
                      } catch {}
                      if (onHistoryRedirect) onHistoryRedirect();
                    } catch {
                      toast.error("Please enter valid TX ID.");
                    } finally {
                      setVerifyingTx(false);
                    }
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-60"
                >
                  {verifyingTx ? "Verifying..." : "Verify TX ID"}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="rounded-2xl bg-muted p-4 ring-1 ring-ring">
          <div className="text-sm font-semibold">Deposit Summary</div>
          <div className="mt-2 grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-subtext">Network</span>
              <span className="font-medium">{RECEIVER_WALLET_NETWORK}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-subtext">Amount</span>
              <span className="font-semibold">
                {verifiedAmount != null ? `${verifiedAmount.toFixed(2)} ${RECEIVER_WALLET_TOKEN}` : "From TX ID"}
              </span>
            </div>
          </div>
          {step === 2 && (
            <div className="mt-4 rounded-xl bg-card p-3 text-center ring-1 ring-ring">
              <div className="text-xs text-subtext">Verification</div>
              <div className="mt-1 text-xl font-bold">{verifyingTx ? "Checking..." : "Awaiting TX ID"}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 sm:p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] min-w-0">
      <div className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-subtext truncate">{label}</div>
      <div className="mt-1 sm:mt-2 text-lg sm:text-2xl font-bold text-foreground truncate">{value}</div>
      {hint ? <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-subtext truncate">{hint}</div> : null}
    </div>
  );
}

export default function UserDashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  /** Admin "view as user" new tab: Bearer token in sessionStorage + fetch patch — does not replace session cookie. */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const imp = params.get("imp");
    if (imp) {
      sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, imp);
      window.history.replaceState({}, "", window.location.pathname || "/dashboard");
    }
    const token = sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!token) return;
    const orig = window.fetch.bind(window);
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      let url = "";
      if (typeof input === "string") url = input;
      else if (input instanceof URL) url = input.href;
      else url = (input as Request).url;
      if (url.startsWith("/api/")) {
        const h = new Headers(init?.headers);
        if (!h.has("Authorization")) h.set("Authorization", `Bearer ${token}`);
        return orig(input, { ...init, headers: h });
      }
      return orig(input, init);
    };
    return () => {
      window.fetch = orig;
    };
  }, []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [active, setActive] = useState<"home" | "network" | "wallet" | "settings" | "income" | "activation">("home");
  const [activating, setActivating] = useState(false);
  const activationInFlightRef = useRef(false);

  const onActivate = async () => {
    if (isActivatedMemberStatus(profile?.status)) {
      toast.info("Account is already active");
      return;
    }
    if (activationInFlightRef.current) return;
    activationInFlightRef.current = true;
    setActivating(true);
    try {
      const res = await fetch("/api/user/activate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Activation failed");
        return;
      }
      if (data.alreadyActivated) {
        toast.info("Account is already activated.");
      } else {
        toast.success("Account activated successfully!");
      }
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("deposit:updated"));
        }
      } catch {}
    } catch {
      toast.error("Activation failed");
    } finally {
      activationInFlightRef.current = false;
      setActivating(false);
    }
  };
  const [walletOpen, setWalletOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [walletTab, setWalletTab] = useState<
    "deposit" | "depositHistory" | "withdraw" | "withdrawHistory" | "p2pTransfer" | "p2pHistory" | "internalTransfer" | "commissions"
  >("deposit");
  const [profileTab, setProfileTab] = useState<"profile" | "security" | "withdrawAddress">("profile");
  const [level, setLevel] = useState(6);
  const maxLevel = TREE_QUERY_MAX_DEPTH;

  const [profile, setProfile] = useState<any>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(0);
  const [referralGate, setReferralGate] = useState<any>(null);
  const [gateSecondsLeft, setGateSecondsLeft] = useState<number>(0);
  const [directReferrals, setDirectReferrals] = useState<number>(0);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<any[]>([]);
  const [recentDeposits, setRecentDeposits] = useState<any[]>([]);
  const [refStats, setRefStats] = useState<{ total: number; levels: Record<string, number> } | null>(null);
  const [digitalPoolSystem, setDigitalPoolSystem] = useState<null | {
    title: string;
    url: string;
    username: string;
    email: string;
    password: string;
  }>(null);
  const [teamNodes, setTeamNodes] = useState<any[] | null>(null);
  const [uplineNodes, setUplineNodes] = useState<any[] | null>(null);
  const [notifications, setNotifications] = useState<any[] | null>(null);
  const [unread, setUnread] = useState<number>(0);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [uiMessage, setUiMessage] = useState("");
  const [origin, setOrigin] = useState("");
  const [receiverWalletAddress, setReceiverWalletAddress] = useState(DEFAULT_RECEIVER_WALLET_ADDRESS);
  const [linkCopied, setLinkCopied] = useState(false);
  const [openLevels, setOpenLevels] = useState<number[]>([]);
  const [totals, setTotals] = useState<{
    deposits: number;
    withdrawals: number;
    commissionTotal: number;
    commissionToday: number;
  }>({ deposits: 0, withdrawals: 0, commissionTotal: 0, commissionToday: 0 });
  const [p2pRecipient, setP2pRecipient] = useState("");
  const [p2pAmount, setP2pAmount] = useState("");
  const [p2pSecurityCode, setP2pSecurityCode] = useState("");
  const [p2pMsg, setP2pMsg] = useState("");
  const [p2pItems, setP2pItems] = useState<any[]>([]);
  const [p2pConfirmOpen, setP2pConfirmOpen] = useState(false);
  const [p2pConfirmName, setP2pConfirmName] = useState("");
  const [p2pConfirmEmail, setP2pConfirmEmail] = useState("");
  const [p2pConfirmAmount, setP2pConfirmAmount] = useState<number | null>(null);
  const [p2pShowSecurity, setP2pShowSecurity] = useState(false);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [commissionsLoading, setCommissionsLoading] = useState(false);

  const [internalTransferAmount, setInternalTransferAmount] = useState("");
  const [internalTransferMsg, setInternalTransferMsg] = useState("");
  const [transferSource, setTransferSource] = useState<"usdt" | "withdraw">("withdraw");
  const [transferTarget, setTransferTarget] = useState<"withdraw" | "usdt">("usdt");

  const onInternalTransfer = async () => {
    setInternalTransferMsg("");
    try {
      const amt = Number(internalTransferAmount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setInternalTransferMsg("Invalid amount");
        toast.error("Invalid amount");
        return;
      }
      if (!p2pSecurityCode.trim()) {
        setInternalTransferMsg("Security Code is required");
        toast.error("Security Code is required");
        return;
      }
      if (transferSource === (transferTarget as any)) {
        setInternalTransferMsg("Source and Target wallets must be different");
        toast.error("Source and Target wallets must be different");
        return;
      }
      const res = await fetch("/api/user/internal-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          amount: amt, 
          securityCode: p2pSecurityCode.trim(),
          source: transferSource,
          target: transferTarget
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInternalTransferMsg(data?.error || "Transfer failed");
        toast.error(data?.error || "Transfer failed");
        return;
      }
      toast.success(`Transfer successful`);
      setInternalTransferAmount("");
      setP2pSecurityCode("");
      // Refresh data
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("deposit:updated"));
        }
      } catch {}
    } catch {
      setInternalTransferMsg("Transfer failed");
      toast.error("Transfer failed");
    }
  };

  const onP2PTransfer = async () => {
    setP2pMsg("");
    try {
      const amt = Number(p2pAmount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setP2pMsg("Invalid amount");
        toast.error("Invalid amount");
        return;
      }
      if (amt < MIN_WITHDRAW_OR_P2P_USDT) {
        setP2pMsg(`Minimum transfer is ${MIN_WITHDRAW_OR_P2P_USDT} USDT`);
        toast.error(`Minimum transfer is ${MIN_WITHDRAW_OR_P2P_USDT} USDT`);
        return;
      }
      if (!p2pRecipient.trim()) {
        setP2pMsg("Recipient is required");
        toast.error("Recipient is required");
        return;
      }
      const previewRes = await fetch("/api/user/p2p-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: p2pRecipient.trim(), amount: amt, preview: true }),
      });
      const previewData = await previewRes.json();
      if (!previewRes.ok) {
        setP2pMsg(typeof previewData?.error === "string" ? previewData.error : "Transfer validation failed");
        toast.error(typeof previewData?.error === "string" ? previewData.error : "Transfer validation failed");
        return;
      }
      setP2pConfirmName(String(previewData?.recipient?.username || ""));
      setP2pConfirmEmail(String(previewData?.recipient?.email || ""));
      setP2pConfirmAmount(amt);
      setP2pConfirmOpen(true);
    } catch {
      setP2pMsg("Transfer validation failed");
      toast.error("Transfer validation failed");
    }
  };

  const confirmP2PTransfer = async () => {
    setP2pMsg("");
    try {
      const amt = Number(p2pAmount);
      if (!Number.isFinite(amt) || amt < MIN_WITHDRAW_OR_P2P_USDT) {
        setP2pMsg(`Minimum transfer is ${MIN_WITHDRAW_OR_P2P_USDT} USDT`);
        toast.error(`Minimum transfer is ${MIN_WITHDRAW_OR_P2P_USDT} USDT`);
        return;
      }
      if (!p2pSecurityCode.trim()) {
        setP2pMsg("Security Code is required");
        toast.error("Security Code is required");
        return;
      }
      const res = await fetch("/api/user/p2p-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: p2pRecipient.trim(), amount: amt, securityCode: p2pSecurityCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setP2pMsg(typeof data?.error === "string" ? data.error : "Transfer failed");
        toast.error(typeof data?.error === "string" ? data.error : "Transfer failed");
        return;
      }
      setP2pConfirmOpen(false);
      toast.success("Transfer successful");
      setP2pRecipient("");
      setP2pAmount("");
      setP2pSecurityCode("");
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("deposit:updated"));
        }
      } catch {}
      try {
        const hres = await fetch("/api/user/p2p-history", { cache: "no-store" });
        const h = await hres.json();
        if (hres.ok) setP2pItems(Array.isArray(h?.items) ? h.items : []);
      } catch {}
    } catch {
      setP2pMsg("Transfer failed");
      toast.error("Transfer failed");
    }
  };
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const o = typeof window !== "undefined" ? window.location.origin : "";
    setOrigin(o);
  }, []);

  useEffect(() => {
    const loadPublicSettings = async () => {
      try {
        const res = await fetch("/api/public/settings", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && typeof data?.receiverWalletAddress === "string" && data.receiverWalletAddress.trim()) {
          setReceiverWalletAddress(data.receiverWalletAddress.trim());
        }
      } catch {
        /* keep fallback */
      }
    };
    loadPublicSettings().catch(() => undefined);
  }, []);

  const refreshDashboardData = async () => {
    if (status === "loading" || !session?.user?.id) return;
    try {
      const [dashRes, statsRes, notiRes] = await Promise.all([
        fetch("/api/user/dashboard", { cache: "no-store" }),
        fetch("/api/user/referral-stats", { cache: "no-store" }),
        fetch("/api/user/notifications", { cache: "no-store" }),
      ]);
      const dash = await dashRes.json();
      if (!dashRes.ok) {
        if (dashRes.status === 403) {
          await signOut({ callbackUrl: getAuthRedirectUrl("/") });
          return;
        }
        return;
      }
      setRecentWithdrawals(Array.isArray(dash.recentWithdrawals) ? dash.recentWithdrawals : []);
      setDigitalPoolSystem(
        dash.digitalPoolSystem && typeof dash.digitalPoolSystem === "object"
          ? dash.digitalPoolSystem
          : null,
      );
      if (dash?.profile) {
        setProfile(dash.profile);
        setCurrentLevel(Number(dash?.currentLevel ?? 0));
        setReferralGate(dash.referralGate ?? null);
        setGateSecondsLeft(Number(dash?.referralGate?.secondsLeft ?? 0));
        setDirectReferrals(dash.directReferrals ?? 0);
        setRecentTransactions(dash.recentTransactions ?? []);
        setRecentDeposits(dash.recentDeposits ?? []);
        setTotals({
          deposits: Number(dash?.depositTotal ?? 0),
          withdrawals: Number(dash?.withdrawalTotal ?? 0),
          commissionTotal: Number(dash?.commissionTotal ?? 0),
          commissionToday: Number(dash?.commissionToday ?? 0),
        });
      }

      if (statsRes.ok) {
        const stats = await statsRes.json();
        if (stats?.levels) setRefStats(stats);
      }

      if (notiRes.ok) {
        const noti = await notiRes.json();
        if (Array.isArray(noti?.items)) {
          setNotifications(noti.items);
          setUnread(noti.unread ?? 0);
        }
      }

      // 3. Team/Upline Data (Fetch only if active or empty)
      if (!teamNodes || !uplineNodes || active === "network" || active === "home") {
        const [teamRes, uplineRes] = await Promise.all([
          fetch("/api/user/my-team", { cache: "no-store" }),
          fetch("/api/user/upline", { cache: "no-store" }),
        ]);
        if (teamRes.ok) {
          const team = await teamRes.json();
          if (team?.nodes) setTeamNodes(team.nodes);
        }
        if (uplineRes.ok) {
          const upline = await uplineRes.json();
          if (upline?.nodes) setUplineNodes(upline.nodes);
        }
      }

      // 4. Tab-specific data (Fetch if active)
      if (active === "wallet" && walletTab === "p2pHistory") {
        const res = await fetch("/api/user/p2p-history", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setP2pItems(Array.isArray(data?.items) ? data.items : []);
      }
      
      if ((active === "wallet" && walletTab === "commissions") || active === "income") {
        const res = await fetch("/api/user/commissions", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setCommissions(Array.isArray(data?.items) ? data.items : []);
      }

      if (active === "wallet" && walletTab === "withdrawHistory") {
        const wres = await fetch("/api/user/withdrawals", { cache: "no-store" });
        const wdata = await wres.json();
        if (wres.ok && Array.isArray(wdata?.items)) setRecentWithdrawals(wdata.items);
      }
    } catch (err) {
      console.error("Dashboard refresh error:", err);
    }
  };

  useEffect(() => {
    if (status === "loading" || !session?.user?.id) return;
    
    refreshDashboardData();
    const interval = setInterval(refreshDashboardData, 3000); // Master poll every 3 seconds for near real-time feel
    
    const handler = () => refreshDashboardData();
    if (typeof window !== "undefined") {
      window.addEventListener("deposit:updated", handler);
      window.addEventListener("profile:updated", handler);
    }
    
    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("deposit:updated", handler);
        window.removeEventListener("profile:updated", handler);
      }
    };
  }, [session?.user?.id, status, active, walletTab]);

  useEffect(() => {
    if (!referralGate || referralGate.state !== "unverified") return;
    setGateSecondsLeft(Number(referralGate.secondsLeft ?? 0));
    const id = setInterval(() => {
      setGateSecondsLeft((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [referralGate?.state, referralGate?.expiresAt]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/user/p2p-history", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) return;
        setP2pItems(Array.isArray(data?.items) ? data.items : []);
      } catch {}
    };
    if (active === "wallet" && walletTab === "p2pHistory") {
      load();
    }
  }, [active, walletTab]);

  useEffect(() => {
    const load = async () => {
      setCommissionsLoading(true);
      try {
        const res = await fetch("/api/user/commissions", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setCommissions(Array.isArray(data?.items) ? data.items : []);
      } catch (e) {
        console.error("Failed to load commissions", e);
      } finally {
        setCommissionsLoading(false);
      }
    };
    if ((active === "wallet" && walletTab === "commissions") || active === "income") {
      load();
    }
  }, [active, walletTab]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user?.id) {
      router.replace("/");
      return;
    }
  }, [router, session?.user?.id, status]);

  const networkRows = useMemo(() => {
    const rows: { level: number; count: number }[] = [];
    for (let i = 1; i <= maxLevel; i += 1) {
      rows.push({ level: i, count: refStats?.levels?.[String(i)] ?? 0 });
    }
    return rows;
  }, [refStats]);

  /** my-team API includes self at depth 0; counts should match referral-stats (downline only). */
  const teamDownlineCount = useMemo(
    () => (teamNodes ? teamNodes.filter((n: any) => Number(n.depth) > 0).length : 0),
    [teamNodes],
  );

  /** Direct children per user in team tree — hide copy link when ≥2 (quota full). */
  const teamDirectCountByParentId = useMemo(() => {
    const m = new Map<string, number>();
    if (!teamNodes) return m;
    for (const n of teamNodes) {
      const pid = n.referredById;
      if (pid) {
        m.set(pid, (m.get(pid) ?? 0) + 1);
      }
    }
    return m;
  }, [teamNodes]);

  const activeRow = networkRows[level - 1] ?? { level, count: 0 };
  const initials = useMemo(() => {
    const name = profile?.username ?? "";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? "U";
    const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "S";
    return `${a}${b}`.toUpperCase();
  }, [profile?.username]);
  const gateTime = useMemo(() => {
    const s = Math.max(0, Number(gateSecondsLeft || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }, [gateSecondsLeft]);

  const handleMenuToggle = () => {
    const lg = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
    if (lg) {
      setSidebarCollapsed((v) => !v);
    } else {
      setMobileNavOpen(true);
    }
  };

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-transparent text-foreground">
      <div className="mx-auto max-w-7xl overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex w-full min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleMenuToggle}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              ☰
            </button>
            <button
              type="button"
              onClick={handleMenuToggle}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] hover:bg-muted lg:inline-flex"
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
            <div className="flex min-w-0 items-center">
              <img src="/logo.jpeg" alt="Digital Community Magnet" className="h-6 w-auto rounded-md ring-1 ring-ring sm:h-7" />
            </div>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex flex-col items-end gap-0.5 text-right">
              <div className="flex min-w-0 max-w-[min(72vw,20rem)] items-center justify-end gap-2 sm:max-w-[22rem]">
                <span className="min-w-0 truncate text-xs font-semibold text-foreground sm:text-sm">
                  {profile?.username ?? "User"}
                </span>
                <span className="shrink-0">
                  {referralGate?.state === "unverified" ? (
                    <span className="inline-flex flex-col rounded-md bg-red-600 px-1.5 py-0.5 text-[8px] font-semibold leading-tight text-white ring-1 ring-red-600/20 sm:px-2 sm:text-[9px]">
                      <span>UNVERIFIED</span>
                      <span className="font-mono tabular-nums">{gateTime}</span>
                    </span>
                  ) : referralGate?.state === "verified" ? (
                    <span className="inline-block rounded-full bg-green-600 px-1.5 py-0.5 text-[9px] font-semibold text-white ring-1 ring-green-600/20 sm:px-2 sm:text-[10px]">
                      VERIFIED
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="max-w-[min(72vw,20rem)] truncate font-mono text-[9px] text-subtext sm:max-w-[22rem] sm:text-[10px]">
                <span className="font-sans text-[8px] font-medium uppercase tracking-wide text-subtext sm:text-[9px]">Ref </span>
                {referralGate?.state === "unverified" ? "—" : profile?.referrerCode ?? "—"}
              </div>
            </div>
            <div className="relative shrink-0" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
            >
              {initials}
            </button>

            {userMenuOpen && (
              <div
                className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),16rem)] min-w-[14rem] rounded-2xl bg-card p-2 shadow-xl ring-1 ring-ring animate-in fade-in slide-in-from-top-2 duration-200"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActive("settings");
                    setUserMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  <FaUserCircle className="text-primary" size={18} />
                  My Profile
                </button>
                <div className="my-1.5 border-t border-ring/50" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: getAuthRedirectUrl("/") })}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-500 transition hover:bg-red-500/10"
                >
                  <FaSignOutAlt className="text-red-500" size={18} />
                  Logout
                </button>
              </div>
            )}
            </div>
          </div>
        </div>

        <div className={`mt-6 grid gap-6 w-full max-w-full overflow-hidden ${sidebarCollapsed ? "lg:grid-cols-[1fr]" : "lg:grid-cols-[260px_1fr]"}`}>
          {!sidebarCollapsed && (
          <aside className="hidden min-w-0 lg:block">
            <div className="rounded-3xl bg-card p-3 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
              <div className="px-3 py-2 text-xs font-medium text-subtext">Menu</div>
              <div className="mt-1 grid gap-1">
                <button
                  type="button"
                  onClick={() => { setActive("home"); setWalletOpen(false); setProfileOpen(false); }}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    active === "home" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>Home</span>
                  {active === "home" ? <span className="text-primary">●</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => { setActive("network"); setWalletOpen(false); setProfileOpen(false); }}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    active === "network" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>My Network</span>
                  {active === "network" ? <span className="text-primary">●</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => { setActive("income"); setWalletOpen(false); setProfileOpen(false); }}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    active === "income" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>Income History</span>
                  {active === "income" ? <span className="text-primary">●</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => { setActive("activation"); setWalletOpen(false); setProfileOpen(false); }}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    active === "activation" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>Activation Account</span>
                  {active === "activation" ? <span className="text-primary">●</span> : null}
                </button>
                <div className="grid gap-1">
                  <button
                    type="button"
                    onClick={() => { setWalletOpen((v) => !v); setProfileOpen(false); }}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                      active === "wallet" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                    }`}
                    aria-expanded={walletOpen}
                  >
                    <span>Wallet</span>
                    <span className={`transition-transform ${walletOpen ? "rotate-90" : ""}`}>›</span>
                  </button>
                  <div className={`ml-2 grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${walletOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"}`}>
                    <div className="min-h-0 overflow-hidden rounded-2xl bg-background ring-1 ring-ring">
                      {[
                        { key: "deposit", label: "Deposit Funds" },
                        { key: "depositHistory", label: "Deposit History" },
                        { key: "withdraw", label: "Withdraw Funds" },
                        { key: "withdrawHistory", label: "Withdrawal History" },
                        { key: "p2pTransfer", label: "P2P Fund Transfer" },
                        { key: "internalTransfer", label: "Transfer Between Accounts" },
                        { key: "p2pHistory", label: "P2P History" },
                      ].map((i) => (
                        <button
                          key={i.key}
                          type="button"
                          onClick={() => { setActive("wallet"); setWalletTab(i.key as typeof walletTab); }}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                            active === "wallet" && walletTab === (i.key as typeof walletTab)
                              ? "bg-muted text-foreground"
                              : "text-subtext hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span>{i.label}</span>
                          {active === "wallet" && walletTab === (i.key as typeof walletTab) ? <span className="text-primary">●</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid gap-1">
                  <button
                    type="button"
                    onClick={() => { setProfileOpen((v) => !v); setWalletOpen(false); }}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                      active === "settings" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                    }`}
                    aria-expanded={profileOpen}
                  >
                    <span>My Profile</span>
                    <span className={`transition-transform ${profileOpen ? "rotate-90" : ""}`}>›</span>
                  </button>
                  <div className={`ml-2 grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${profileOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"}`}>
                    <div className="min-h-0 overflow-hidden rounded-2xl bg-background ring-1 ring-ring">
                      {[
                        { key: "profile", label: "Update Profile" },
                        { key: "withdrawAddress", label: "Withdrawal Address" },
                        { key: "security", label: "Security Code" },
                      ].map((i) => (
                        <button
                          key={i.key}
                          type="button"
                          onClick={() => { setActive("settings"); setProfileTab(i.key as typeof profileTab); }}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                            active === "settings" && profileTab === (i.key as typeof profileTab)
                              ? "bg-muted text-foreground"
                              : "text-subtext hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span>{i.label}</span>
                          {active === "settings" && profileTab === (i.key as typeof profileTab) ? <span className="text-primary">●</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl bg-card p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
              <div className="text-xs text-subtext">
                {referralGate?.state !== "unverified" && profile?.status !== "admin" && directReferrals >= 2 ? "User" : "Referral Link"}
              </div>
              {referralGate?.state === "unverified" ? (
                <>
                  <div className="mt-2 min-w-0 break-all whitespace-normal rounded-2xl bg-muted px-4 py-3 text-sm text-foreground ring-1 ring-ring">
                    Verify your account to unlock
                  </div>
                  <button
                    type="button"
                    disabled
                    className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-gray-300 text-sm font-semibold text-gray-600 shadow-sm ring-1 ring-gray-300"
                  >
                    Verify to Unlock
                  </button>
                </>
              ) : profile?.status !== "admin" && directReferrals >= 2 ? (
                <>
                  <div className="mt-2 rounded-2xl bg-muted px-4 py-3 text-sm font-medium text-foreground ring-1 ring-ring">
                    {profile?.username ?? "—"}
                  </div>
                  <p className="mt-2 text-xs text-subtext">2/2 direct referrals — invite more using your team members’ links below.</p>
                </>
              ) : (
                <>
                  <div className="mt-2 min-w-0 break-all whitespace-normal rounded-2xl bg-muted px-4 py-3 text-sm text-foreground ring-1 ring-ring">
                    {origin ? `${origin}/?ref=${profile?.referrerCode ?? ""}` : profile?.referrerCode ?? "-"}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const text = origin ? `${origin}/?ref=${profile?.referrerCode ?? ""}` : profile?.referrerCode ?? "";
                      const ok = await copyTextToClipboard(text);
                      if (ok) {
                        setLinkCopied(true);
                        toast.success("Invite link copied");
                        setTimeout(() => setLinkCopied(false), 1200);
                      } else {
                        setUiMessage("Copy failed");
                        toast.error("Copy failed");
                        setTimeout(() => setUiMessage(""), 1200);
                      }
                    }}
                    className={`mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl text-sm font-semibold shadow-sm ring-1 transition ${
                      linkCopied
                        ? "bg-green-500 text-white ring-green-500/20"
                        : "bg-primary text-white ring-primary/20 hover:bg-primary/90"
                    }`}
                  >
                    {linkCopied ? "Link Copied" : "Copy Link"}
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: getAuthRedirectUrl("/") })}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-muted px-5 text-sm font-medium text-foreground ring-1 ring-ring transition hover:bg-secondary"
            >
              Logout
            </button>
          </aside>
          )}
          
          <div className="lg:hidden">
            <div className="min-w-0 rounded-3xl bg-card p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
              <div className="text-xs text-subtext">
                {referralGate?.state !== "unverified" && profile?.status !== "admin" && directReferrals >= 2 ? "User" : "Referral Link"}
              </div>
              {referralGate?.state === "unverified" ? (
                <>
                  <div className="mt-2 break-all rounded-2xl bg-muted px-4 py-3 text-sm text-foreground ring-1 ring-ring">
                    Verify your account to unlock
                  </div>
                  <button
                    type="button"
                    disabled
                    className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-gray-300 text-sm font-semibold text-gray-600 shadow-sm ring-1 ring-gray-300"
                    aria-label="Referral link locked"
                  >
                    Verify to Unlock
                  </button>
                </>
              ) : profile?.status !== "admin" && directReferrals >= 2 ? (
                <>
                  <div className="mt-2 rounded-2xl bg-muted px-4 py-3 text-sm font-medium text-foreground ring-1 ring-ring">
                    {profile?.username ?? "—"}
                  </div>
                  <p className="mt-2 text-xs text-subtext">2/2 direct referrals — invite more using your team members’ links below.</p>
                </>
              ) : (
                <>
                  <div className="mt-2 min-w-0 break-all whitespace-normal rounded-2xl bg-muted px-4 py-3 text-sm text-foreground ring-1 ring-ring">
                    {origin ? `${origin}/?ref=${profile?.referrerCode ?? ""}` : profile?.referrerCode ?? "-"}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const text = origin ? `${origin}/?ref=${profile?.referrerCode ?? ""}` : profile?.referrerCode ?? "";
                      const ok = await copyTextToClipboard(text);
                      if (ok) {
                        setLinkCopied(true);
                        toast.success("Invite link copied");
                        setTimeout(() => setLinkCopied(false), 1200);
                      } else {
                        setUiMessage("Copy failed");
                        toast.error("Copy failed");
                        setTimeout(() => setUiMessage(""), 1200);
                      }
                    }}
                    className={`mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl text-sm font-semibold shadow-sm ring-1 transition ${
                      linkCopied
                        ? "bg-green-500 text-white ring-green-500/20"
                        : "bg-primary text-white ring-primary/20 hover:bg-primary/90"
                    }`}
                    aria-label="Copy referral link"
                  >
                    {linkCopied ? "Link Copied" : "Copy Link"}
                  </button>
                </>
              )}
            </div>
          </div>

          <main className="min-w-0 flex-1 space-y-6 overflow-hidden">
            {active === "home" && (
              <div className="space-y-6">
                <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8 overflow-hidden">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm text-subtext">Welcome back</div>
                      <div className="mt-1 text-2xl font-semibold">{profile?.username ?? "User"}</div>
                      <div className="mt-2 max-w-2xl text-sm text-subtext">
                        {uiMessage ? uiMessage : "Your balances, team stats, and activity will show here."}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSupportOpen(true)}
                        className="inline-flex items-center justify-center rounded-full bg-card px-5 py-2 text-sm font-medium text-foreground shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] transition hover:bg-muted w-full sm:w-auto"
                      >
                        Support
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {[
                      { href: "https://facebook.com", icon: <FaFacebook size={22} />, name: "Facebook" },
                      { href: "https://twitter.com", icon: <FaTwitter size={22} />, name: "Twitter" },
                      { href: "https://instagram.com", icon: <FaInstagram size={22} />, name: "Instagram" },
                      { href: "https://youtube.com", icon: <FaYoutube size={22} />, name: "YouTube" },
                      { href: "https://t.me", icon: <FaTelegramPlane size={22} />, name: "Telegram" },
                      { href: WHATSAPP_CHANNEL_URL, icon: <FaWhatsapp size={22} />, name: "WhatsApp" },
                    ].map((s) => (
                      <a
                        key={s.name}
                        href={s.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-muted p-4 text-center ring-1 ring-ring transition hover:bg-background"
                        aria-label={s.name}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card ring-1 ring-ring text-foreground">
                          {s.icon}
                        </div>
                        <div className="text-xs text-subtext">{s.name}</div>
                      </a>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-3 grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {isActivatedMemberStatus(profile?.status) && profile?.status !== "admin" ? (
                    <div className="rounded-2xl bg-card p-4 sm:p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] min-w-0">
                      <div className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-subtext truncate">
                        Current plan
                      </div>
                      <div className="mt-1 sm:mt-2 text-lg sm:text-2xl font-bold text-foreground truncate tabular-nums">
                        $10
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-green-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-600 ring-1 ring-green-500/25 dark:text-green-400">
                          Active
                        </span>
                        <span className="text-[10px] sm:text-xs text-subtext">One-time activation</span>
                      </div>
                    </div>
                  ) : null}
                  <StatCard label="Withdraw Wallet" value={toUSD(Number(profile?.withdrawBalance ?? 0))} />
                  <StatCard label="USDT Wallet (Main)" value={toUSD(Number(profile?.usdtBalance ?? 0))} />
                  <StatCard label="Total Income" value={toUSD(totals.commissionTotal)} />
                  <StatCard label="Daily Income" value={toUSD(totals.commissionToday)} />
                  <StatCard label="Total Team" value={String(refStats?.total ?? 0)} />
                  <StatCard label="Total Deposit" value={toUSD(totals.deposits)} />
                  <StatCard label="Total Withdraw" value={toUSD(totals.withdrawals)} />
                   <StatCard label="Level Completed" value={`L${currentLevel}`} />
                    </div>

                  {digitalPoolSystem ? (
                    <div className="mt-4 overflow-hidden rounded-2xl bg-card shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
                      <a
                        href={digitalPoolSystem.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-3 text-inherit no-underline outline-none transition hover:bg-muted/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 sm:px-5 sm:py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-primary">{digitalPoolSystem.title}</div>
                            <div className="mt-1 text-xs text-subtext">
                              Upar click karein — nayi tab mein Digital Pool login. Email / password par click se copy.
                            </div>
                          </div>
                          <div className="shrink-0 text-xs font-medium text-primary">Open →</div>
                        </div>
                      </a>
                      <div className="border-t border-[color:var(--ring)] px-4 py-3 sm:px-5 sm:py-4">
                        <div className="grid gap-2 text-sm">
                          <button
                            type="button"
                            title="Tap to copy username"
                            onClick={async () => {
                              const ok = await copyTextToClipboard(digitalPoolSystem.username);
                              if (ok) toast.success("Username copied");
                              else toast.error("Copy failed");
                            }}
                            className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted/80 px-3 py-2 text-left ring-1 ring-ring/60 transition hover:bg-muted sm:flex-row sm:items-baseline sm:gap-2"
                          >
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-subtext">
                              Username
                            </span>
                            <span className="min-w-0 truncate font-medium text-foreground">{digitalPoolSystem.username}</span>
                          </button>
                          <button
                            type="button"
                            title="Tap to copy email"
                            onClick={async () => {
                              const ok = await copyTextToClipboard(digitalPoolSystem.email);
                              if (ok) toast.success("Email copied");
                              else toast.error("Copy failed");
                            }}
                            className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted/80 px-3 py-2 text-left ring-1 ring-ring/60 transition hover:bg-muted sm:flex-row sm:items-baseline sm:gap-2"
                          >
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-subtext">
                              Email
                            </span>
                            <span className="min-w-0 truncate font-medium text-foreground">{digitalPoolSystem.email}</span>
                          </button>
                          <button
                            type="button"
                            title="Tap to copy password"
                            onClick={async () => {
                              const ok = await copyTextToClipboard(digitalPoolSystem.password);
                              if (ok) toast.success("Password copied");
                              else toast.error("Copy failed");
                            }}
                            className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted/80 px-3 py-2 text-left ring-1 ring-ring/60 transition hover:bg-muted sm:flex-row sm:items-baseline sm:gap-2"
                          >
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-subtext">
                              Password
                            </span>
                            <span className="min-w-0 break-all font-mono text-xs font-medium text-foreground">
                              {digitalPoolSystem.password}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {teamNodes && (
                  <div className="grid gap-6 xl:grid-cols-1 w-full max-w-full overflow-hidden">
                    {uplineNodes && uplineNodes.length > 0 ? (
                      <div className="rounded-2xl bg-card p-5 ring-1 ring-ring overflow-hidden max-w-full shadow-[0_0_15px_rgba(1,163,151,0.15)] transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">My Upline</div>
                        </div>
                        <div className="mt-4">
                          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                            {uplineNodes.map((n: any, idx: number) => (
                              <div key={n.id} className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
                                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 text-sm ring-1 ring-ring">
                                  <span className="truncate font-medium text-foreground">{n.username}</span>
                                  <span className="max-w-[50%] truncate font-medium text-primary">ID: {n.referrerCode}</span>
                                </div>
                                {idx < uplineNodes.length - 1 && (
                                  <span className="hidden sm:inline text-xl text-subtext">→</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div className="hidden lg:block rounded-2xl bg-card p-5 ring-1 ring-ring">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="text-sm font-semibold">My Team Tree</div>
                        <div className="text-xs text-subtext">{teamDownlineCount} members</div>
                      </div>
                      <div className="mt-4 overflow-x-auto overflow-y-hidden custom-scrollbar pb-2">
                        <div className="min-w-max">
                          <NetworkTree nodes={teamNodes} onCopyMessage={setUiMessage} origin={origin} />
                        </div>
                      </div>
                    </div>
                    
                    <div className="rounded-2xl bg-card p-5 ring-1 ring-ring overflow-hidden max-w-full shadow-[0_0_15px_rgba(1,163,151,0.15)] transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">My Team List</div>
                        <div className="text-xs text-subtext">{teamDownlineCount} members</div>
                      </div>
                      <div className="mt-4 max-h-[260px] overflow-auto rounded-2xl ring-1 ring-ring custom-scrollbar">
                        <div className="divide-y divide-[color:var(--ring)]">
                          {teamNodes
                            .filter((n: any) => Number(n.depth) > 0)
                            .slice(0, 40)
                            .map((n: any) => (
                            <div key={n.id} className="flex min-w-0 flex-col justify-between gap-1 px-4 py-3 text-sm xs:flex-row xs:items-center xs:gap-3">
                              <div className="min-w-0 truncate">
                                <div className="truncate font-medium text-foreground">{n.email === COMPANY_ADMIN_EMAIL ? "Admin" : n.username}</div>
                                <div className="truncate text-[10px] sm:text-xs text-subtext">
                                  {formatUserTreeLevelLabel(n.depth)} ·{" "}
                                  {(teamDirectCountByParentId.get(n.id) ?? 0) >= 2
                                    ? "—"
                                    : n.email === COMPANY_ADMIN_EMAIL || n.verified
                                      ? n.referrerCode
                                      : "—"}
                                </div>
                              </div>
                              <div className="truncate text-[10px] sm:text-xs text-subtext">{n.email}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {active === "network" && teamNodes && (
              <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] overflow-hidden">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-subtext">My Network</div>
                    <div className="mt-1 text-2xl font-semibold">Level-wise View</div>
                    <div className="mt-2 max-w-2xl text-sm text-subtext">
                      Expand a level to see user IDs. Showing up to L{maxLevel}.
                    </div>
                  </div>
                  <div className="text-xs text-subtext">{teamDownlineCount} members</div>
                </div>
                <div className="mt-6">
                  {Array.from({ length: maxLevel }, (_, i) => i + 1).map((lvl) => {
                    const members = teamNodes.filter((n: any) => Number(n.depth) === lvl);
                    const count = refStats?.levels?.[String(lvl)] ?? members.length;
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
                        <div className="flex w-full select-none items-center justify-between px-5 py-4 text-left pointer-events-none">
                          <span className="text-base font-medium text-foreground">Level {lvl}</span>
                          <span className="rounded-full bg-card px-3 py-1 text-sm text-subtext ring-1 ring-ring">
                            {count} {count === 1 ? "member" : "members"}
                          </span>
                        </div>
                        <div
                          className={`overflow-hidden px-5 transition-[max-height,opacity] duration-300 ease-out ${
                            open ? "max-h-[min(60vh,280px)] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
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
                                    needsTwo
                                      ? "bg-amber-500/15 ring-1 ring-amber-500/35 dark:bg-amber-500/10"
                                      : ""
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
                                        if (ok) {
                                          setUiMessage("Referral link copied");
                                          toast.success("Referral link copied");
                                          setTimeout(() => setUiMessage(""), 1200);
                                        } else {
                                          setUiMessage("Copy failed");
                                          toast.error("Copy failed");
                                          setTimeout(() => setUiMessage(""), 1200);
                                        }
                                      }}
                                      className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs text-subtext ring-1 ring-ring transition hover:text-foreground"
                                      aria-label="Copy referral link"
                                    >
                                      <span className="max-w-[100px] truncate sm:max-w-[200px]">{n.referrerCode ?? "-"}</span>
                                      <span className="text-primary">Copy</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled
                                      className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs text-subtext ring-1 ring-ring opacity-70"
                                      aria-label="Referral code locked"
                                    >
                                      <span>—</span>
                                      <span className="text-subtext">Locked</span>
                                    </button>
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
            )}

            {active === "wallet" && walletTab === "deposit" && (
              <WalletSection 
                balance={profile?.balance ?? 0} 
                userId={profile?.id ?? ""}
                receiverWalletAddress={receiverWalletAddress}
                onHistoryRedirect={() => {
                  setWalletTab("depositHistory");
                }}
              />
            )}
            {active === "wallet" && walletTab === "depositHistory" && (
              <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] overflow-hidden">
                <div className="text-sm font-semibold">Deposit History</div>
                <div className="mt-4 w-full overflow-x-auto rounded-2xl ring-1 ring-ring custom-scrollbar">
                  <div className="min-w-[500px]">
                    <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 bg-muted px-4 py-3 text-xs font-medium text-subtext">
                      <div>Hash</div>
                      <div>Amount</div>
                      <div>Status</div>
                      <div>Date</div>
                    </div>
                    <div className="divide-y divide-[color:var(--ring)]">
                      {recentDeposits.map((t: any) => (
                        <div key={t.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 px-4 py-4 text-sm">
                          <div className="truncate font-mono text-[10px]">{t.txHash ?? "-"}</div>
                          <div className="font-medium text-foreground">{toUSD(Number(t.amount))}</div>
                          <div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${
                              t.status === "confirmed" ? "bg-green-500/10 text-green-500 ring-green-500/20" :
                              t.status === "pending" ? "bg-yellow-500/10 text-yellow-500 ring-yellow-500/20" :
                              "bg-red-500/10 text-red-500 ring-red-500/20"
                            }`}>
                              {t.status}
                            </span>
                          </div>
                          <div className="text-subtext">{String(t.createdAt).slice(0, 10)}</div>
                        </div>
                      ))}
                      {recentDeposits.length === 0 && (
                        <div className="px-4 py-6 text-center text-sm text-subtext">No deposits yet</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {active === "wallet" && walletTab === "withdraw" && (
              <UserWithdrawSection
                profile={profile}
                onGoToWithdrawAddressSettings={() => {
                  setActive("settings");
                  setProfileTab("withdrawAddress");
                  setProfileOpen(true);
                }}
              />
            )}
            {active === "wallet" && walletTab === "withdrawHistory" && (
              <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] overflow-hidden">
                <div className="text-sm font-semibold">Withdrawal History</div>
                <div className="mt-1 text-xs text-subtext">
                  On-chain requests (gross) and moves from withdraw wallet to your USDT balance · Hash when approved by admin
                </div>
                <div className="mt-4 w-full overflow-x-auto rounded-2xl ring-1 ring-ring custom-scrollbar">
                  <div className="min-w-[520px]">
                    <div className="grid grid-cols-[1fr_0.7fr_0.9fr_0.75fr] gap-2 bg-muted px-4 py-3 text-xs font-medium text-subtext">
                      <div>Hash</div>
                      <div>Amount (USDT)</div>
                      <div>Status</div>
                      <div>Date</div>
                    </div>
                    <div className="divide-y divide-[color:var(--ring)]">
                      {recentWithdrawals.map((w: any) => (
                        <div key={w.id} className="grid grid-cols-[1fr_0.7fr_0.9fr_0.75fr] gap-2 px-4 py-4 text-sm">
                          <div
                            className="truncate font-mono text-[11px]"
                            title={w.entryKind === "internal_usdt" ? "Withdraw wallet → USDT wallet" : w.txHash || undefined}
                          >
                            {w.entryKind === "internal_usdt" ? (
                              <span className="font-sans text-foreground">→ USDT wallet (your account)</span>
                            ) : w.txHash ? (
                              w.txHash
                            ) : w.status === "pending" ? (
                              "Pending approval"
                            ) : (
                              "—"
                            )}
                          </div>
                          <div className="font-medium text-foreground">
                            {Number(
                              w.grossRequested != null && w.grossRequested !== ""
                                ? w.grossRequested
                                : w.amount ?? 0,
                            ).toFixed(2)}
                          </div>
                          <div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${
                                w.entryKind === "internal_usdt"
                                  ? "bg-primary/10 text-primary ring-primary/25"
                                  : w.status === "approved"
                                    ? "bg-green-500/10 text-green-500 ring-green-500/20"
                                    : w.status === "pending"
                                      ? "bg-yellow-500/10 text-yellow-500 ring-yellow-500/20"
                                      : "bg-red-500/10 text-red-500 ring-red-500/20"
                              }`}
                            >
                              {w.entryKind === "internal_usdt" ? "to USDT" : String(w.status || "")}
                            </span>
                          </div>
                          <div className="text-subtext">{String(w.createdAt).slice(0, 10)}</div>
                        </div>
                      ))}
                      {recentWithdrawals.length === 0 && (
                        <div className="px-4 py-6 text-center text-sm text-subtext">No withdrawals yet</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {active === "wallet" && walletTab === "p2pTransfer" && (
              <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] overflow-hidden">
                <div className="text-sm font-semibold">P2P Fund Transfer</div>
                <div className="mt-1 text-xs text-subtext">
                  Send from your USDT wallet · Recipient receives in their USDT wallet · Minimum {MIN_WITHDRAW_OR_P2P_USDT}{" "}
                  USDT
                </div>
                <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-foreground">
                  <span className="font-medium text-primary">Note:</span> A <span className="font-medium">10% fee</span> will apply on P2P transfers. For a limited time, this fee is <span className="font-medium">waived (free)</span>.
                </div>
                <div className="mx-auto mt-4 w-full max-w-md">
                  <div className="rounded-2xl bg-muted/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-ring sm:p-6">
                    <div className="grid gap-3">
                      <label className="grid gap-1">
                        <span className="text-xs text-subtext">Recipient (Email / Referrer Code / Username)</span>
                        <input
                          value={p2pRecipient}
                          onChange={(e) => setP2pRecipient(e.target.value)}
                          className="h-10 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="user@example.com or ABC123"
                        />
                      </label>
                      <label className="grid gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-subtext">Amount (USDT)</span>
                          <span className="text-xs font-medium text-primary">Balance: {toUSD(Number((profile as any)?.usdtBalance ?? 0))}</span>
                        </div>
                        <input
                          type="number"
                          value={p2pAmount}
                          onChange={(e) => setP2pAmount(e.target.value)}
                          className="h-10 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder={`${MIN_WITHDRAW_OR_P2P_USDT}`}
                          min={MIN_WITHDRAW_OR_P2P_USDT}
                          step="0.01"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={onP2PTransfer}
                        className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
                      >
                        Send
                      </button>
                      {p2pMsg ? (
                        <div className="rounded-2xl bg-background/80 p-3 text-xs text-subtext ring-1 ring-ring">{p2pMsg}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
                {p2pConfirmOpen ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                      <div className="w-full max-w-sm rounded-2xl bg-card p-5 ring-1 ring-ring">
                        <div className="text-sm font-semibold">Confirm Transfer</div>
                        <div className="mt-2 text-xs text-subtext">Please confirm the details before sending.</div>
                        <div className="mt-4 grid gap-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-subtext">Recipient</span>
                            <span className="font-medium text-foreground truncate max-w-[60%] text-right">{p2pConfirmName || "-"}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-subtext">Email</span>
                            <span className="font-medium text-foreground truncate max-w-[60%] text-right">{p2pConfirmEmail || "-"}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-subtext">Amount</span>
                            <span className="font-bold text-foreground">{Number(p2pConfirmAmount ?? 0).toFixed(2)} USDT</span>
                          </div>
                          <label className="grid gap-1 mt-2">
                            <span className="text-xs text-subtext">Security Code</span>
                            <div className="relative">
                              <input
                                type={p2pShowSecurity ? "text" : "password"}
                                value={p2pSecurityCode}
                                onChange={(e) => setP2pSecurityCode(e.target.value.trim())}
                                className="h-10 w-full rounded-2xl bg-background pr-12 pl-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                                placeholder="Your Security Code"
                              />
                              <button
                                type="button"
                                onClick={() => setP2pShowSecurity(v => !v)}
                                className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext"
                                aria-label={p2pShowSecurity ? "Hide security code" : "Show security code"}
                              >
                                {p2pShowSecurity ? <FaEyeSlash /> : <FaEye />}
                              </button>
                            </div>
                          </label>
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setP2pConfirmOpen(false)}
                            className="h-10 rounded-2xl bg-muted text-sm font-medium ring-1 ring-ring transition hover:bg-secondary"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={confirmP2PTransfer}
                            className="h-10 rounded-2xl bg-primary text-sm font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90"
                          >
                            Confirm & Send
                          </button>
                        </div>
                      </div>
                    </div>
                ) : null}
              </div>
            )}
            {active === "wallet" && walletTab === "internalTransfer" && (
              <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] overflow-hidden">
                <div className="text-sm font-semibold">Transfer Funds</div>
                <div className="mt-1 text-xs text-subtext">Transfer between your internal wallets</div>
                {profile?.status === "withdraw_suspend" ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-foreground">
                    <div className="font-semibold text-amber-700 dark:text-amber-400">Transfer from withdraw wallet locked</div>
                    <p className="mt-2 text-xs text-subtext">
                      {profile?.withdrawSuspendSource === "auto_team_inactivity"
                        ? `No downline activation in the last ${Number(profile?.teamWithdrawInactivityDays ?? 10)} days. Add a team member who completes activation — withdrawals unlock automatically.`
                        : "Your withdrawal is suspended. Please contact customer support."}
                    </p>
                  </div>
                ) : (
                <div className="mt-6 grid gap-4 sm:max-w-md">
                  <div className="grid gap-1">
                    <span className="text-xs text-subtext px-1 uppercase tracking-wider">From Wallet</span>
                    <select
                      className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      value={transferSource}
                      onChange={(e) => setTransferSource(e.target.value as typeof transferSource)}
                    >
                      <option value="withdraw">Withdraw Wallet ({toUSD(Number(profile?.withdrawBalance ?? 0))})</option>
                    </select>
                  </div>

                  <div className="grid gap-1">
                    <span className="text-xs text-subtext px-1 uppercase tracking-wider">To Wallet</span>
                    <select
                      className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      value={transferTarget}
                      onChange={(e) => setTransferTarget(e.target.value as typeof transferTarget)}
                    >
                      <option value="usdt">USDT Wallet (Main) ({toUSD(Number((profile as any)?.usdtBalance ?? 0))})</option>
                    </select>
                  </div>

                  <label className="grid gap-1">
                    <span className="text-xs text-subtext px-1 uppercase tracking-wider">Amount to Transfer (USDT)</span>
                    <input
                      value={internalTransferAmount}
                      onChange={(e) => setInternalTransferAmount(e.target.value)}
                      className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="10"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-subtext px-1 uppercase tracking-wider">Security Code</span>
                    <input
                      type="password"
                      value={p2pSecurityCode}
                      onChange={(e) => setP2pSecurityCode(e.target.value.trim())}
                      className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Your Security Code"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onInternalTransfer}
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
                  >
                    Transfer Now
                  </button>
                  {internalTransferMsg ? (
                    <div className="rounded-2xl bg-muted p-3 text-xs text-subtext ring-1 ring-ring">{internalTransferMsg}</div>
                  ) : null}
                </div>
                )}
              </div>
            )}
            {active === "wallet" && walletTab === "p2pHistory" && (
              <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] overflow-hidden">
                <div className="text-sm font-semibold">P2P History</div>
                <div className="mt-4 w-full overflow-x-auto rounded-2xl ring-1 ring-ring custom-scrollbar">
                  <div className="min-w-[500px]">
                    <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr] gap-2 bg-muted px-4 py-3 text-xs font-medium text-subtext">
                      <div>Counterparty</div>
                      <div>Direction</div>
                      <div>Amount</div>
                      <div>Date</div>
                    </div>
                    <div className="divide-y divide-[color:var(--ring)]">
                      {p2pItems.map((t: any) => (
                        <div key={t.id} className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr] gap-2 px-4 py-4 text-sm">
                          <div className="truncate">{t.counterparty || "-"}</div>
                          <div className="font-medium text-foreground capitalize">{t.direction}</div>
                          <div className="font-medium text-foreground">{Number(t.amount).toFixed(2)}</div>
                          <div className="text-subtext">{String(t.createdAt).slice(0, 10)}</div>
                        </div>
                      ))}
                      {p2pItems.length === 0 && (
                        <div className="px-4 py-6 text-center text-sm text-subtext">No P2P transfers yet</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/user/p2p-history", { cache: "no-store" });
                        const data = await res.json();
                        if (res.ok) setP2pItems(Array.isArray(data?.items) ? data.items : []);
                      } catch {}
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-full bg-card px-4 text-xs font-medium text-foreground ring-1 ring-ring transition hover:bg-muted"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            )}
            {active === "income" && (
              <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] overflow-hidden">
                <div className="text-sm font-semibold">Income History</div>
                <div className="mt-1 text-xs text-subtext">
                  Your commissions will show here as you earn from your network. Each row shows type, level, and amount.
                </div>
                <div className="mt-4 w-full overflow-x-auto rounded-2xl ring-1 ring-ring custom-scrollbar">
                  <div className="min-w-[600px]">
                    <div className="grid grid-cols-[1.6fr_0.65fr_1.1fr_0.85fr_0.95fr] gap-2 bg-muted px-4 py-3 text-xs font-medium text-subtext">
                      <div>From User</div>
                      <div>Level</div>
                      <div>Type</div>
                      <div>Amount</div>
                      <div>Date</div>
                    </div>
                    <div className="divide-y divide-[color:var(--ring)]">
                      {commissionsLoading ? (
                        <div className="px-4 py-6 text-center text-sm text-subtext">Loading history...</div>
                      ) : (
                        <>
                          {commissions.map((c: any) => (
                            <div
                              key={c.id}
                              className="grid grid-cols-[1.6fr_0.65fr_1.1fr_0.85fr_0.95fr] gap-2 px-4 py-4 text-sm hover:bg-muted/30 transition"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-foreground truncate">{c.fromUser}</div>
                                <div className="text-[10px] text-subtext truncate">{c.fromEmail}</div>
                              </div>
                              <div className="flex items-center">
                                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/20">
                                  L{c.level}
                                </span>
                              </div>
                              <div className="flex items-center text-[11px] text-subtext leading-snug">
                                {typeof c.kindLabel === "string" ? c.kindLabel : "—"}
                              </div>
                              <div className="font-bold text-foreground flex items-center">{toUSD(Number(c.amount))}</div>
                              <div className="text-subtext flex items-center">{new Date(c.date).toLocaleDateString()}</div>
                            </div>
                          ))}
                          {commissions.length === 0 && (
                            <div className="px-4 py-6 text-center text-sm text-subtext">No commission history found</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    onClick={async () => {
                      setCommissionsLoading(true);
                      try {
                        const res = await fetch("/api/user/commissions", { cache: "no-store" });
                        const data = await res.json();
                        if (res.ok) setCommissions(Array.isArray(data?.items) ? data.items : []);
                      } catch {} finally { setCommissionsLoading(false); }
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-full bg-card px-4 text-xs font-medium text-foreground ring-1 ring-ring transition hover:bg-muted"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            )}

            {active === "activation" && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-primary uppercase tracking-wider">Starter Plan</div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary ring-1 ring-primary/20">POPULAR</span>
                  </div>
                  {referralGate?.state === "unverified" && gateSecondsLeft > 0 && (
                    <div className="mt-4 rounded-2xl bg-yellow-500/10 p-3 ring-1 ring-yellow-500/20">
                      <div className="text-[10px] font-medium text-yellow-600 uppercase tracking-tight">Activation Deadline</div>
                      <div className="mt-1 flex items-center gap-2">
                        <svg className="h-4 w-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-bold text-yellow-700 font-mono">
                          {Math.floor(gateSecondsLeft / 3600)}h {Math.floor((gateSecondsLeft % 3600) / 60)}m {gateSecondsLeft % 60}s
                        </span>
                      </div>
                    </div>
                  )}
                  {referralGate?.state === "unverified" && gateSecondsLeft === 0 && (
                    <div className="mt-4 rounded-2xl bg-red-500/10 p-3 ring-1 ring-red-500/20">
                      <div className="text-[10px] font-medium text-red-600 uppercase tracking-tight">Status</div>
                      <div className="mt-1 flex items-center gap-2">
                        <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-bold text-red-700">PERIOD EXPIRED</span>
                      </div>
                    </div>
                  )}
                  <div className="mt-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-foreground">$10</span>
                      <span className="text-xs text-subtext">/ one-time</span>
                    </div>
                  </div>
                  <div className="mt-6 space-y-3">
                    {[
                      "Lifetime Activation",
                      "Unlock 20 Levels Commission",
                      "Daily Payout Access",
                      "Priority Support",
                    ].map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-subtext">
                        <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </div>
                    ))}
                  </div>
                  <div className="mt-8">
                    {isActivatedMemberStatus(profile?.status) ? (
                      <div className="flex h-11 w-full items-center justify-center rounded-2xl bg-green-500/10 text-sm font-semibold text-green-500 ring-1 ring-green-500/20">
                        ALREADY ACTIVATED
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={onActivate}
                        disabled={activating}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-lg shadow-primary/20 ring-1 ring-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50"
                      >
                        {activating ? (
                          <>
                            <svg className="mr-2 h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Activating...
                          </>
                        ) : (
                          "Activate Account"
                        )}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 text-center text-[10px] text-subtext italic">
                    Note: $10 is taken from your Main balance first, then from your USDT wallet (Main + USDT must total at least $10).
                  </div>
                </div>
              </div>
            )}

            {active === "settings" && (
              <UserProfileSection
                profile={profile}
                onProfileUpdate={(updatedData) => setProfile((prev: any) => ({ ...prev, ...updatedData }))}
                tab={profileTab}
              />
            )}
          </main>
        </div>
      </div>

      {supportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true" aria-label="Support">
          <button type="button" onClick={() => setSupportOpen(false)} className="absolute inset-0 bg-black/30" aria-label="Close" />
          <div className="relative w-full max-w-md rounded-3xl bg-card p-6 shadow-xl ring-1 ring-ring">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold">Support</div>
                <div className="mt-1 text-sm text-subtext">Submit payment or account related issues.</div>
              </div>
              <button
                type="button"
                onClick={() => setSupportOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-ring transition hover:bg-secondary"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form
              className="mt-6 grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setUiMessage("");
                try {
                  const res = await fetch("/api/user/support", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subject: supportSubject, message: supportMessage }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setUiMessage(typeof data?.error === "string" ? data.error : "Support failed");
                    toast.error("Support failed");
                    return;
                  }
                  setUiMessage("Ticket submitted");
                  toast.success("Ticket submitted");
                  setSupportSubject("");
                  setSupportMessage("");
                  setSupportOpen(false);
                } catch {
                  setUiMessage("Support failed");
                  toast.error("Support failed");
                }
              }}
            >
              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Subject</span>
                <input
                  required
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Payment pending"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Message</span>
                <textarea
                  required
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  className="min-h-[120px] w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Details..."
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/30"
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-[min(100%,20rem)] max-w-[min(100vw-1rem,20rem)] flex-col overflow-hidden bg-card shadow-xl ring-1 ring-ring sm:w-[84%] sm:max-w-xs">
            <div className="flex shrink-0 items-center justify-between px-4 py-4">
              <div className="text-sm font-semibold">Menu</div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-ring hover:bg-secondary"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
              <div className="grid gap-1">
                {[
                  { key: "home", label: "Home" },
                  { key: "network", label: "My Network" },
                  { key: "income", label: "Income History" },
                  { key: "activation", label: "Activation Account" },
                ].map((i) => (
                  <button
                    key={i.key}
                    type="button"
                    onClick={() => {
                      setActive(i.key as typeof active);
                      setMobileNavOpen(false);
                      setWalletOpen(false);
                      setProfileOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                      active === i.key ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>{i.label}</span>
                    {active === i.key ? <span className="text-primary">●</span> : null}
                  </button>
                ))}

                <div className="grid gap-1">
                  <button
                    type="button"
                    onClick={() => { setProfileOpen((v) => !v); setWalletOpen(false); }}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                      active === "settings" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>My Profile</span>
                    <span className={`transition-transform ${profileOpen ? "rotate-90" : ""}`}>›</span>
                  </button>
                  <div className={`ml-2 grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${profileOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"}`}>
                    <div className="min-h-0 overflow-hidden rounded-2xl bg-background ring-1 ring-ring">
                      {[
                        { key: "profile", label: "Update Profile" },
                        { key: "withdrawAddress", label: "Withdrawal Address" },
                        { key: "security", label: "Security Code" },
                      ].map((sub) => (
                        <button
                          key={sub.key}
                          type="button"
                          onClick={() => {
                            setActive("settings");
                            setProfileTab(sub.key as typeof profileTab);
                            setMobileNavOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                            active === "settings" && profileTab === sub.key
                              ? "bg-muted text-foreground"
                              : "text-subtext hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span>{sub.label}</span>
                          {active === "settings" && profileTab === sub.key ? <span className="text-primary">●</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-1">
                  <button
                    type="button"
                    onClick={() => { setWalletOpen((v) => !v); setProfileOpen(false); }}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                      active === "wallet" ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>Wallet</span>
                    <span className={`transition-transform ${walletOpen ? "rotate-90" : ""}`}>›</span>
                  </button>
                  <div className={`ml-2 grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${walletOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"}`}>
                    <div className="min-h-0 overflow-hidden rounded-2xl bg-background ring-1 ring-ring">
                      {[
                        { key: "deposit", label: "Deposit Funds" },
                        { key: "depositHistory", label: "Deposit History" },
                        { key: "withdraw", label: "Withdraw Funds" },
                        { key: "withdrawHistory", label: "Withdrawal History" },
                        { key: "p2pTransfer", label: "P2P Fund Transfer" },
                        { key: "internalTransfer", label: "Transfer Between Accounts" },
                        { key: "p2pHistory", label: "P2P History" },
                      ].map((sub) => (
                        <button
                          key={sub.key}
                          type="button"
                          onClick={() => {
                            setActive("wallet");
                            setWalletTab(sub.key as typeof walletTab);
                            setMobileNavOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                            active === "wallet" && walletTab === sub.key
                              ? "bg-muted text-foreground"
                              : "text-subtext hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span>{sub.label}</span>
                          {active === "wallet" && walletTab === sub.key ? <span className="text-primary">●</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 border-t border-ring/40 px-1 pb-2 pt-4">
              <div className="text-xs text-subtext">
                {referralGate?.state !== "unverified" && profile?.status !== "admin" && directReferrals >= 2 ? "User" : "Referral Link"}
              </div>
              {referralGate?.state === "unverified" ? (
                <>
                  <div className="mt-2 rounded-2xl bg-muted px-4 py-3 text-sm text-foreground ring-1 ring-ring">
                    Verify your account to unlock
                  </div>
                  <button type="button" disabled className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-gray-300 text-sm font-semibold text-gray-600 ring-1 ring-gray-300">
                    Verify to Unlock
                  </button>
                </>
              ) : profile?.status !== "admin" && directReferrals >= 2 ? (
                <>
                  <div className="mt-2 rounded-2xl bg-muted px-4 py-3 text-sm font-medium text-foreground ring-1 ring-ring">
                    {profile?.username ?? "—"}
                  </div>
                  <p className="mt-2 text-xs text-subtext">2/2 direct referrals — use team links in My Network.</p>
                </>
              ) : (
                <>
                  <div className="mt-2 min-w-0 break-all whitespace-normal rounded-2xl bg-muted px-4 py-3 text-sm text-foreground ring-1 ring-ring">
                    {origin ? `${origin}/?ref=${profile?.referrerCode ?? ""}` : profile?.referrerCode ?? "-"}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const text = origin ? `${origin}/?ref=${profile?.referrerCode ?? ""}` : profile?.referrerCode ?? "";
                      const ok = await copyTextToClipboard(text);
                      if (ok) {
                        toast.success("Link copied");
                        setMobileNavOpen(false);
                      } else {
                        toast.error("Copy failed");
                      }
                    }}
                    className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
                  >
                    Copy Link
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => signOut({ callbackUrl: getAuthRedirectUrl("/") })}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-red-600/10 text-sm font-semibold text-red-600 shadow-sm ring-1 ring-red-600/20 transition hover:bg-red-600/20"
              >
                Logout
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
