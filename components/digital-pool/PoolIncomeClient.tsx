"use client";

import { useEffect, useState } from "react";
import { poolApiFetch } from "@/lib/pool-api-fetch";

const toUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );

export function PoolIncomeClient() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await poolApiFetch("/api/user/commissions?digitalPool=1", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && Array.isArray(data?.items)) setItems(data.items);
        else setItems([]);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl bg-card p-6 ring-1 ring-ring">
        <div className="text-sm text-subtext">Loading…</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
      <div className="text-sm font-semibold">Income History</div>
      <div className="mt-1 text-xs text-subtext">Digital Pool wallet credits — rewards & completions (newest first)</div>
      <div className="mt-4 max-h-[min(70vh,480px)] overflow-auto rounded-2xl ring-1 ring-ring custom-scrollbar">
        <div className="divide-y divide-[color:var(--ring)]">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-subtext">No income records yet</div>
          ) : (
            items.map((row: any) => (
              <div key={row.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{row.kindLabel ?? "Commission"}</div>
                  <div className="truncate text-xs text-subtext">
                    {row.fromUser ? `From ${row.fromUser}` : ""}{" "}
                    {row.date ? new Date(row.date).toLocaleString() : ""}
                  </div>
                </div>
                <div className="font-semibold tabular-nums text-primary sm:text-right">{toUSD(Number(row.amount ?? 0))}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
