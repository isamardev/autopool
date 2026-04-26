"use client";
/** Requires WagmiProvider in the tree if you mount this component (not used by default). */

import { useMemo } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { bsc } from "wagmi/chains";
import { toast } from "react-toastify";

type Props = {
  fullWidth?: boolean;
  connectText?: string;
  connectedText?: string;
};

export default function ConnectWallet({ fullWidth, connectText, connectedText }: Props) {
  const { isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const wcConnector = useMemo(
    () => connectors.find((c) => (c.name || "").toLowerCase().includes("walletconnect")),
    [connectors]
  );

  const { switchChainAsync } = useSwitchChain();

  const onConnect = async () => {
    try {
      if (!wcConnector) {
        toast.error("WalletConnect connector not available");
        return;
      }
      await connectAsync({ connector: wcConnector, chainId: bsc.id });
      try {
        await switchChainAsync({ chainId: bsc.id });
      } catch {}
      toast.success("Wallet connected");
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "Failed to connect";
      toast.error(msg);
    }
  };

  const loading = isPending;

  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={loading || isConnected}
      className={`inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-60 ${fullWidth ? "w-full" : ""}`}
    >
      {loading ? "Connecting..." : isConnected ? (connectedText || "Connected") : (connectText || "Connect Trust Wallet")}
    </button>
  );
}
