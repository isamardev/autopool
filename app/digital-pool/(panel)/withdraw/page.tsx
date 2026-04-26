"use client";

import Link from "next/link";
import { UserWithdrawSection } from "@/components/user-panel-forms";
import { poolApiFetch } from "@/lib/pool-api-fetch";
import { usePoolDashboard } from "@/components/digital-pool/usePoolDashboard";

export default function DigitalPoolWithdrawPage() {
  const { profile, loading } = usePoolDashboard();

  if (loading && !profile) {
    return (
      <div className="rounded-3xl bg-card p-6 ring-1 ring-ring">
        <div className="text-sm text-subtext">Loading…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-3xl bg-card p-6 ring-1 ring-ring">
        <div className="text-sm text-foreground">Profile load nahi ho saka. Dobara login karein.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <UserWithdrawSection
        profile={profile}
        apiFetch={poolApiFetch}
        digitalPoolWithdraw
        onGoToWithdrawAddressSettings={() => {
          window.location.href = "/digital-pool/profile/withdraw-address";
        }}
      />
      <p className="text-center text-xs text-subtext">
        Withdrawal address?{" "}
        <Link href="/digital-pool/profile/withdraw-address" className="font-medium text-primary underline-offset-2 hover:underline">
          Profile → Withdrawal Address
        </Link>
      </p>
    </div>
  );
}
