"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { poolApiFetch } from "@/lib/pool-api-fetch";

export type PoolDashboardSnapshot = {
  profile: Record<string, unknown> & {
    username?: string;
    status?: string;
    withdrawBalance?: number;
    usdtBalance?: number;
  };
  currentLevel: number;
  depositTotal: number;
  withdrawalTotal: number;
  commissionTotal: number;
  commissionToday: number;
  refStats: { total: number; levels: Record<string, number> } | null;
};

export function usePoolDashboard() {
  const [snapshot, setSnapshot] = useState<PoolDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, statsRes] = await Promise.all([
        poolApiFetch("/api/user/dashboard", { cache: "no-store" }),
        poolApiFetch("/api/user/referral-stats", { cache: "no-store" }),
      ]);
      const dash = await dashRes.json();
      let refStats: PoolDashboardSnapshot["refStats"] = null;
      if (statsRes.ok) {
        const stats = await statsRes.json();
        if (stats?.levels) {
          refStats = {
            total: Number(stats?.total ?? 0),
            levels: stats.levels as Record<string, number>,
          };
        }
      }

      if (dashRes.ok && dash?.profile) {
        const l1 = dash.digitalPoolL1Reward as { granted?: boolean; error?: string } | undefined;
        if (l1?.granted) {
          toast.success("$100 Digital Pool withdraw wallet mein credit ho gaye — level 1 complete");
        } else if (l1?.error && typeof l1.error === "string" && l1.error.length > 0) {
          toast.error(`Pool wallet credit issue: ${l1.error}`);
        }
        setSnapshot({
          profile: dash.profile,
          currentLevel: Number(dash?.currentLevel ?? 0),
          depositTotal: Number(dash?.depositTotal ?? 0),
          withdrawalTotal: Number(dash?.withdrawalTotal ?? 0),
          commissionTotal: Number(dash?.commissionTotal ?? 0),
          commissionToday: Number(dash?.commissionToday ?? 0),
          refStats,
        });
      } else {
        setSnapshot(null);
      }
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const setProfile = useCallback(
    (patch: Record<string, unknown> | ((prev: PoolDashboardSnapshot["profile"]) => PoolDashboardSnapshot["profile"])) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const next =
          typeof patch === "function"
            ? (patch as (p: PoolDashboardSnapshot["profile"]) => PoolDashboardSnapshot["profile"])(prev.profile)
            : { ...prev.profile, ...patch };
        return { ...prev, profile: next };
      });
    },
    [],
  );

  useEffect(() => {
    void refresh();
    const onUp = () => void refresh();
    window.addEventListener("deposit:updated", onUp);
    return () => window.removeEventListener("deposit:updated", onUp);
  }, [refresh]);

  const profile = useMemo(() => snapshot?.profile ?? null, [snapshot]);

  return { snapshot, profile, loading, refresh, setProfile };
}
