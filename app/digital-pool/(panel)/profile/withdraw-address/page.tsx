"use client";

import { UserProfileSection } from "@/components/user-panel-forms";
import { poolApiFetch } from "@/lib/pool-api-fetch";
import { usePoolDashboard } from "@/components/digital-pool/usePoolDashboard";

export default function DigitalPoolProfileWithdrawAddressPage() {
  const { profile, loading, setProfile } = usePoolDashboard();

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
    <UserProfileSection
      profile={profile}
      tab="withdrawAddress"
      apiFetch={poolApiFetch}
      onProfileUpdate={(u) => setProfile((prev: any) => ({ ...prev, ...u }))}
    />
  );
}
