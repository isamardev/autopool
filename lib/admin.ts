import { getResolvedReceiverWalletAddress } from "@/lib/receiver-wallet";

export const ADMIN_WALLET_ADDRESS = getResolvedReceiverWalletAddress();

export function isAdminAddress(addr?: string | null) {
  if (!addr) return false;
  return addr.toLowerCase() === ADMIN_WALLET_ADDRESS.toLowerCase();
}
