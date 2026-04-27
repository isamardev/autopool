"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  MIN_WITHDRAW_OR_P2P_USDT,
  WITHDRAW_FEE_PERCENT,
  withdrawNetAfterFee,
} from "@/lib/wallet-limits";

const toUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );

const BEP20_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function hasSavedBep20WithdrawAddress(profile: any): boolean {
  const a = String(profile?.permanentWithdrawAddress ?? "").trim();
  return BEP20_ADDRESS_RE.test(a);
}

export function UserWithdrawSection({
  profile,
  onGoToWithdrawAddressSettings,
  apiFetch = fetch,
  /** When true, balance and locks use `digitalPoolWithdrawBalance` (Digital Pool panel only). */
  digitalPoolWithdraw = false,
}: {
  profile: any;
  onGoToWithdrawAddressSettings: () => void;
  apiFetch?: typeof fetch;
  digitalPoolWithdraw?: boolean;
}) {
  const [withdrawAmount, setWithdrawAmount] = useState<string>("10");
  const [withdrawAddress, setWithdrawAddress] = useState<string>(profile?.permanentWithdrawAddress || "");
  const [securityCode, setSecurityCode] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  /** Main panel only — Digital Pool withdraw wallet ignores account `withdraw_suspend`. */
  const withdrawSuspended = !digitalPoolWithdraw && profile?.status === "withdraw_suspend";
  const withdrawAutoTeamSuspend = profile?.withdrawSuspendSource === "auto_team_inactivity";
  const withdrawUnlocked = hasSavedBep20WithdrawAddress(profile);
  const teamInactivityDays = Number(profile?.teamWithdrawInactivityDays ?? 10);
  const withdrawWalletBalance = digitalPoolWithdraw
    ? Number(profile?.digitalPoolWithdrawBalance ?? 0)
    : Number(profile?.withdrawBalance ?? 0);

  const withdrawGrossPreview =
    (() => {
      const n = Number(withdrawAmount);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();

  useEffect(() => {
    if (profile?.permanentWithdrawAddress) {
      setWithdrawAddress(profile.permanentWithdrawAddress);
    }
  }, [profile?.permanentWithdrawAddress]);

  const onWithdraw = async () => {
    if (withdrawSuspended || !withdrawUnlocked) return;
    setMsg("");
    try {
      const amt = Number(withdrawAmount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setMsg("Invalid amount");
        toast.error("Invalid amount");
        return;
      }
      if (amt < MIN_WITHDRAW_OR_P2P_USDT) {
        setMsg(`Minimum withdrawal is ${MIN_WITHDRAW_OR_P2P_USDT} USDT`);
        toast.error(`Minimum withdrawal is ${MIN_WITHDRAW_OR_P2P_USDT} USDT`);
        return;
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(withdrawAddress.trim())) {
        setMsg("Invalid USDT address");
        toast.error("Invalid USDT address");
        return;
      }
      if (!securityCode.trim()) {
        setMsg("Security Code is required");
        toast.error("Security Code is required");
        return;
      }
      const res = await apiFetch("/api/user/withdraw-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          address: withdrawAddress.trim(),
          securityCode: securityCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(typeof data?.error === "string" ? data.error : "Withdrawal failed");
        toast.error(typeof data?.error === "string" ? data.error : "Withdrawal failed");
        return;
      }
      setMsg("Withdrawal requested — pending admin approval");
      toast.success("Withdrawal requested");
      setWithdrawAmount("10");
      if (!profile?.permanentWithdrawAddress) {
        setWithdrawAddress("");
      }
      setSecurityCode("");
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("deposit:updated"));
        }
      } catch {}
    } catch {
      setMsg("Withdrawal failed");
      toast.error("Withdrawal failed");
    }
  };

  return (
    <div className="rounded-3xl bg-card p-4 sm:p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
      <div className="text-sm font-semibold">
        {digitalPoolWithdraw ? "Digital Pool — Withdraw wallet" : "Withdraw Funds"}
      </div>
      {digitalPoolWithdraw ? (
        <p className="mt-1 text-xs text-subtext">
          Yeh balance main user panel ke withdraw wallet se alag hai. Digital Pool level 1 complete hone par $100 yahan
          credit hota hai.
        </p>
      ) : null}
      {withdrawSuspended ? (
        <>
          <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-foreground">
            <div className="font-semibold text-amber-700 dark:text-amber-400">Withdrawal locked</div>
            <p className="mt-2 text-xs text-subtext">
              {withdrawAutoTeamSuspend
                ? `No downline activation in your team within the last ${teamInactivityDays} days. When anyone in your network completes account activation, your full upline unlocks automatically for another ${teamInactivityDays}-day window.`
                : "Your withdrawal is suspended. Please contact customer support."}
            </p>
            <p className="mt-2 text-xs text-subtext">
              {digitalPoolWithdraw ? "Digital Pool withdraw balance" : "Withdraw wallet balance"}:{" "}
              <span className="font-semibold text-foreground">{toUSD(withdrawWalletBalance)}</span>
            </p>
          </div>
        </>
      ) : !withdrawUnlocked ? (
        <>
          <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-foreground">
            <div className="font-semibold text-amber-700 dark:text-amber-400">Withdrawal locked</div>
            <p className="mt-2 text-xs text-subtext">
              Save your <span className="font-medium text-foreground">BEP20 USDT withdrawal address</span> in My Profile
              first. Until it is saved and locked, you cannot enter an amount or submit a withdrawal. This keeps payouts
              tied to your verified on-chain address.
            </p>
            <p className="mt-2 text-xs text-subtext">
              {digitalPoolWithdraw ? "Digital Pool withdraw balance" : "Withdraw wallet balance"}:{" "}
              <span className="font-semibold text-foreground">{toUSD(withdrawWalletBalance)}</span>
            </p>
            <button
              type="button"
              onClick={onGoToWithdrawAddressSettings}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90 sm:w-auto"
            >
              Save withdrawal address
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-1 text-xs text-subtext">
            Security code, locked BEP20 address, {WITHDRAW_FEE_PERCENT}% fee. Your request stays pending until an admin
            approves (payout tx hash) or rejects (funds return to your withdraw wallet).
          </div>
          <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-foreground">
            <span className="font-medium text-primary">Note:</span> The <span className="font-medium">{WITHDRAW_FEE_PERCENT}% fee</span> is
            deducted from the amount you request; the net amount is what will be sent after approval.
          </div>
          <div className="mx-auto mt-4 w-full max-w-md">
            <div className="rounded-2xl bg-muted/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-ring sm:p-6">
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-subtext">Withdraw Amount (USDT)</span>
                    <span className="text-xs font-medium text-primary">
                      Balance: {toUSD(withdrawWalletBalance)}
                    </span>
                  </div>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="h-10 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={`${MIN_WITHDRAW_OR_P2P_USDT}`}
                    min={MIN_WITHDRAW_OR_P2P_USDT}
                    step="0.01"
                  />
                </label>
                {withdrawGrossPreview != null ? (
                  <div className="rounded-xl bg-background/80 px-3 py-2.5 text-xs leading-relaxed text-foreground ring-1 ring-ring">
                    You will receive{" "}
                    <span className="font-semibold text-primary">{toUSD(withdrawNetAfterFee(withdrawGrossPreview))}</span>{" "}
                    after the {WITHDRAW_FEE_PERCENT}% fee (deducted from {toUSD(withdrawGrossPreview)} requested).
                  </div>
                ) : null}
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">USDT Address (BEP20)</span>
                  <input
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value.trim())}
                    readOnly={!!profile?.permanentWithdrawAddress}
                    className={`h-10 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30 ${profile?.permanentWithdrawAddress ? "cursor-not-allowed bg-muted opacity-80" : ""}`}
                    placeholder="0x..."
                  />
                  {profile?.permanentWithdrawAddress && (
                    <span className="mt-1 px-1 text-[10px] font-medium italic text-green-500">
                      Permanent withdrawal address applied
                    </span>
                  )}
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">Security Code</span>
                  <input
                    type="password"
                    value={securityCode}
                    onChange={(e) => setSecurityCode(e.target.value.trim())}
                    className="h-10 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Your Security Code"
                  />
                </label>
                <button
                  type="button"
                  onClick={onWithdraw}
                  className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
                >
                  Withdraw
                </button>
                {msg ? <div className="rounded-2xl bg-background/80 p-3 text-xs text-subtext ring-1 ring-ring">{msg}</div> : null}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function UserProfileSection({
  profile,
  onProfileUpdate,
  tab,
  apiFetch = fetch,
}: {
  profile: any;
  onProfileUpdate?: (updatedData: any) => void;
  tab: "profile" | "security" | "withdrawAddress";
  apiFetch?: typeof fetch;
}) {
  const [uiMessage, setUiMessage] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingCode, setIsChangingCode] = useState(false);
  const [isUpdatingSecurityCode, setIsUpdatingSecurityCode] = useState(false);
  const [showSecurityCode, setShowSecurityCode] = useState(false);
  const [passwordForSecurityCode, setPasswordForSecurityCode] = useState("");
  const [retrievedSecurityCode, setRetrievedSecurityCode] = useState<string | null>(null);

  const [isSavingWithdrawAddress, setIsSavingWithdrawAddress] = useState(false);
  const [newWithdrawAddress, setNewWithdrawAddress] = useState("");

  const [profileData, setProfileData] = useState({
    username: profile?.username || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [securityCodeData, setSecurityCodeData] = useState({
    currentPassword: "",
    newSecurityCode: "",
  });

  useEffect(() => {
    setShowSecurityCode(false);
    setIsChangingCode(false);
    setRetrievedSecurityCode(null);
    setPasswordForSecurityCode("");
    setUiMessage("");
    setNewWithdrawAddress("");
  }, [tab]);

  useEffect(() => {
    setProfileData((prev) => ({ ...prev, username: profile?.username || "" }));
  }, [profile?.username]);

  const handleWithdrawAddressSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^0x[a-fA-F0-9]{40}$/.test(newWithdrawAddress)) {
      setUiMessage("Invalid USDT (BEP20) address");
      toast.error("Invalid USDT (BEP20) address");
      return;
    }

    setIsSavingWithdrawAddress(true);
    setUiMessage("");

    try {
      const res = await apiFetch("/api/user/update-withdraw-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: newWithdrawAddress.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error || "Failed to save address";
        setUiMessage(errMsg);
        toast.error(errMsg);

        if (data.address && onProfileUpdate) {
          onProfileUpdate({ permanentWithdrawAddress: data.address });
        }

        setIsSavingWithdrawAddress(false);
        return;
      }

      toast.success("Withdrawal address saved permanently");
      if (onProfileUpdate) {
        onProfileUpdate({ permanentWithdrawAddress: newWithdrawAddress.trim() });
      }
      setIsSavingWithdrawAddress(false);
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("deposit:updated"));
        }
      } catch {}
    } catch {
      setUiMessage("Failed to save address");
      toast.error("Failed to save address");
      setIsSavingWithdrawAddress(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setUiMessage("");

    try {
      if (profileData.username !== profile?.username) {
        const res = await apiFetch("/api/user/update-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: profileData.username }),
        });
        const data = await res.json();
        if (!res.ok) {
          const errMsg = data?.error || "Profile update failed";
          setUiMessage(errMsg);
          toast.error(errMsg);
          setIsUpdatingProfile(false);
          return;
        }
        if (onProfileUpdate) {
          onProfileUpdate({ username: profileData.username });
        }
      }

      if (profileData.newPassword) {
        if (profileData.newPassword !== profileData.confirmPassword) {
          setUiMessage("New passwords do not match");
          toast.error("New passwords do not match");
          setIsUpdatingProfile(false);
          return;
        }
        const res = await apiFetch("/api/user/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: profileData.currentPassword,
            newPassword: profileData.newPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const errMsg = data?.error || "Password change failed";
          setUiMessage(errMsg);
          toast.error(errMsg);
          setIsUpdatingProfile(false);
          return;
        }
      }

      const successMsg = "Profile updated successfully";
      setUiMessage(successMsg);
      toast.success(successMsg);
      setProfileData((prev) => ({ ...prev, currentPassword: "", newPassword: "", confirmPassword: "" }));
      setIsUpdatingProfile(false);
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("deposit:updated"));
        }
      } catch {}
    } catch {
      setUiMessage("Update failed");
      toast.error("Update failed");
      setIsUpdatingProfile(false);
    }
  };

  const handleSecurityCodeUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingSecurityCode(true);
    setUiMessage("");

    try {
      const res = await apiFetch("/api/user/update-security-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(securityCodeData),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error || "Security code update failed";
        setUiMessage(errMsg);
        toast.error(errMsg);
        setIsUpdatingSecurityCode(false);
        return;
      }

      const successMsg = "Security code updated successfully";
      setUiMessage(successMsg);
      toast.success(successMsg);
      setSecurityCodeData({ currentPassword: "", newSecurityCode: "" });
      setIsChangingCode(false);
      setIsUpdatingSecurityCode(false);
      if (onProfileUpdate) {
        onProfileUpdate({ securityCode: "exists" });
      }
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("deposit:updated"));
        }
      } catch {}
    } catch {
      setUiMessage("Security code update failed");
      toast.error("Security code update failed");
      setIsUpdatingSecurityCode(false);
    }
  };

  const handleShowSecurityCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setUiMessage("");
    try {
      const res = await apiFetch("/api/user/show-security-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordForSecurityCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error || "Failed to show security code";
        setUiMessage(errMsg);
        toast.error(errMsg);
        return;
      }
      setRetrievedSecurityCode(data.securityCode);
      toast.success("Security code retrieved");
      setPasswordForSecurityCode("");
    } catch {
      setUiMessage("Failed to show security code");
      toast.error("Failed to show security code");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
        <div className="text-sm font-semibold">
          {tab === "profile" ? "Update Profile" : tab === "security" ? "Security Code" : "Withdrawal Address"}
        </div>

        {uiMessage && (
          <div className="mt-4 rounded-2xl bg-muted p-4 text-sm text-foreground ring-1 ring-ring">{uiMessage}</div>
        )}

        <div className="mt-6 grid gap-4">
          {tab === "withdrawAddress" && (
            <div className="rounded-2xl bg-muted p-4 ring-1 ring-ring">
              <div className="text-sm font-medium">Permanent Withdrawal Address</div>

              {profile?.permanentWithdrawAddress ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-1">
                    <span className="px-1 text-[10px] uppercase tracking-wider text-subtext">Current Saved Address</span>
                    <div className="flex items-center justify-between rounded-xl bg-card px-4 py-4 text-sm shadow-inner ring-1 ring-ring">
                      <span className="break-all font-mono font-bold text-primary">{profile.permanentWithdrawAddress}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-green-500/10 p-4 text-xs text-green-600 ring-1 ring-green-500/20">
                    <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>This address is permanently locked to your account for all future withdrawals.</span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleWithdrawAddressSave} className="mt-4 space-y-3">
                  <div className="mb-2 text-xs text-subtext">
                    This address will be locked once saved and used for all your withdrawals.
                  </div>
                  <label className="mb-1 block px-1 text-[10px] uppercase tracking-wider text-subtext">USDT Address (BEP20)</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={newWithdrawAddress}
                    onChange={(e) => setNewWithdrawAddress(e.target.value.trim())}
                    className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                  <div className="flex items-start gap-2 rounded-xl bg-yellow-500/10 p-3 text-xs text-yellow-600 ring-1 ring-yellow-500/20">
                    <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Important: You can only set this address ONCE. Make sure it is a valid BEP20 USDT address.</span>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isSavingWithdrawAddress}
                      className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-xs font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isSavingWithdrawAddress ? "Saving..." : "Save Address Permanently"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {tab === "profile" && (
            <div className="rounded-2xl bg-muted p-4 ring-1 ring-ring">
              <div className="text-sm font-medium">Account Settings</div>
              <form onSubmit={handleProfileUpdate} className="mt-4 space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block px-1 text-[10px] uppercase tracking-wider text-subtext">Email</label>
                    <input
                      type="email"
                      value={profile?.email || ""}
                      readOnly
                      className="w-full cursor-not-allowed rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block px-1 text-[10px] uppercase tracking-wider text-subtext">Phone</label>
                    <input
                      type="tel"
                      value={profile?.phone || ""}
                      readOnly
                      className="w-full cursor-not-allowed rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block px-1 text-[10px] uppercase tracking-wider text-subtext">Name</label>
                  <input
                    type="text"
                    placeholder="Name"
                    value={profileData.username}
                    onChange={(e) => setProfileData({ ...profileData, username: e.target.value })}
                    className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                    required
                  />
                </div>

                <div className="border-t border-ring/30 pt-2">
                  <label className="mb-1 block px-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Change Password (Optional)
                  </label>
                  <div className="space-y-2">
                    <input
                      type="password"
                      placeholder="Current Password (required to change password)"
                      value={profileData.currentPassword}
                      onChange={(e) => setProfileData({ ...profileData, currentPassword: e.target.value })}
                      className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                    />
                    <input
                      type="password"
                      placeholder="New Password"
                      value={profileData.newPassword}
                      onChange={(e) => setProfileData({ ...profileData, newPassword: e.target.value })}
                      className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                    />
                    <input
                      type="password"
                      placeholder="Confirm New Password"
                      value={profileData.confirmPassword}
                      onChange={(e) => setProfileData({ ...profileData, confirmPassword: e.target.value })}
                      className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isUpdatingProfile ? "Updating..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {tab === "security" && (
            <>
              {isChangingCode ? (
                <div className="rounded-2xl bg-muted p-4 ring-1 ring-ring">
                  <div className="text-sm font-medium">Update Security Code</div>
                  <form onSubmit={handleSecurityCodeUpdate} className="mt-4 space-y-3">
                    <input
                      type="password"
                      placeholder="Account Password"
                      value={securityCodeData.currentPassword}
                      onChange={(e) => setSecurityCodeData({ ...securityCodeData, currentPassword: e.target.value })}
                      className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                      required
                    />
                    <input
                      type="text"
                      placeholder="New Security Code"
                      value={securityCodeData.newSecurityCode}
                      onChange={(e) => setSecurityCodeData({ ...securityCodeData, newSecurityCode: e.target.value })}
                      className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                      required
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isUpdatingSecurityCode}
                        className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
                      >
                        {isUpdatingSecurityCode ? "Updating..." : "Update Code"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsChangingCode(false)}
                        className="inline-flex items-center justify-center rounded-full bg-card px-4 py-2 text-xs font-medium text-foreground ring-1 ring-ring transition hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : !showSecurityCode ? (
                <div className="rounded-2xl bg-muted p-4 ring-1 ring-ring">
                  {profile?.securityCode ? (
                    <>
                      <div className="text-sm font-medium text-foreground">Security Code Set</div>
                      <div className="mt-2 text-xs text-subtext">
                        You have already set your security code. It is required for withdrawals and P2P transfers.
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setShowSecurityCode(true)}
                          className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-xs font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90"
                        >
                          View Current Code
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium">Set Security Code</div>
                      <div className="mt-1 text-xs text-subtext">Used for P2P transfers and withdrawals</div>
                      <form onSubmit={handleSecurityCodeUpdate} className="mt-4 space-y-3">
                        <input
                          type="password"
                          placeholder="Account Password"
                          value={securityCodeData.currentPassword}
                          onChange={(e) => setSecurityCodeData({ ...securityCodeData, currentPassword: e.target.value })}
                          className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                          required
                        />
                        <input
                          type="text"
                          placeholder="New Security Code"
                          value={securityCodeData.newSecurityCode}
                          onChange={(e) => setSecurityCodeData({ ...securityCodeData, newSecurityCode: e.target.value })}
                          className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                          required
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={isUpdatingSecurityCode}
                            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
                          >
                            {isUpdatingSecurityCode ? "Setting..." : "Set Code"}
                          </button>
                        </div>
                      </form>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-muted p-4 ring-1 ring-ring">
                  <div className="text-sm font-medium">View Security Code</div>
                  {retrievedSecurityCode ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-ring">
                        <span className="text-subtext">Your Code:</span>
                        <span className="font-mono text-lg font-bold text-primary">{retrievedSecurityCode}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowSecurityCode(false);
                            setRetrievedSecurityCode(null);
                          }}
                          className="inline-flex flex-1 items-center justify-center rounded-full bg-card px-4 py-2 text-xs font-medium text-foreground ring-1 ring-ring transition hover:bg-muted"
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsChangingCode(true);
                            setShowSecurityCode(false);
                            setRetrievedSecurityCode(null);
                          }}
                          className="inline-flex flex-1 items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90"
                        >
                          Change Security Code
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleShowSecurityCode} className="mt-4 space-y-3">
                      <input
                        type="password"
                        placeholder="Enter Account Password to View Code"
                        value={passwordForSecurityCode}
                        onChange={(e) => setPasswordForSecurityCode(e.target.value)}
                        className="w-full rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ring"
                        required
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90"
                        >
                          Show Code
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSecurityCode(false)}
                          className="inline-flex items-center justify-center rounded-full bg-card px-4 py-2 text-xs font-medium text-foreground ring-1 ring-ring transition hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
