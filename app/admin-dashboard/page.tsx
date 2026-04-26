"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DEFAULT_RECEIVER_WALLET_ADDRESS, RECEIVER_WALLET_NETWORK, RECEIVER_WALLET_TOKEN } from "@/lib/receiver-wallet";

const ADMIN_WALLET_USERS_POLL_MS = 8_000;

export default function AdminDashboardPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<Array<{ id: string; username: string; email: string; walletAddress: string; status: string; downlineCount: number }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [receiverWalletAddress, setReceiverWalletAddress] = useState(DEFAULT_RECEIVER_WALLET_ADDRESS);
  const isAdmin = status === "authenticated" && session?.user?.status === "admin";

  const fetchWalletUsers = useCallback(async (silent = false) => {
    if (!isAdmin) return;
    try {
      if (!silent) setLoadingUsers(true);
      const res = await fetch("/api/admin-wallet/users", { cache: "no-store" });
      if (!res.ok) {
        setUsers([]);
        return;
      }
      const json = await res.json();
      setUsers(json.users || []);
    } finally {
      if (!silent) setLoadingUsers(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchWalletUsers(false).catch(() => undefined);
  }, [fetchWalletUsers, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const loadSettings = async () => {
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
    loadSettings().catch(() => undefined);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      fetchWalletUsers(true).catch(() => undefined);
    };
    const id = window.setInterval(tick, ADMIN_WALLET_USERS_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchWalletUsers, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-neutral-950">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-8 py-10 text-center text-neutral-300">
          <div className="text-xl font-semibold">Access Denied</div>
          <div className="mt-2 text-sm">Only the admin panel can view this page.</div>
          <div className="mt-6">
            <Link
              href="/admin"
              className="inline-flex h-10 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
            >
              Open Admin Panel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] bg-neutral-950 px-6 py-8 text-neutral-200">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">Command Center</div>
            <div className="text-xs text-neutral-400">Receiver Wallet: {receiverWalletAddress}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
            <div className="text-sm text-neutral-400">Receiver Network</div>
            <div className="mt-2 text-3xl font-semibold">{RECEIVER_WALLET_NETWORK}</div>
            <div className="mt-2 text-xs text-neutral-500">Incoming {RECEIVER_WALLET_TOKEN} deposits are matched automatically by sender wallet address.</div>
          </div>
          <div className="md:col-span-2 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
            <div className="mb-4 text-sm text-neutral-400">Users</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-400">
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Wallet</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Levels</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr>
                      <td className="px-3 py-3 text-neutral-400" colSpan={5}>
                        Loading...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-neutral-400" colSpan={5}>
                        No users
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="border-t border-neutral-800">
                        <td className="px-3 py-2">{u.username}</td>
                        <td className="px-3 py-2">{u.email}</td>
                        <td className="px-3 py-2">{u.walletAddress}</td>
                        <td className="px-3 py-2">{u.status}</td>
                        <td className="px-3 py-2">{Number(u.downlineCount || 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
