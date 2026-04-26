import { parseUnits } from "viem";

/** Official BSC mainnet USDT (BEP-20) — must match what users send in MetaMask. */
export const USDT_BEP20_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

export const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "decimals", type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

export function toUsdtUnits(amount: number, decimals = 18) {
  return parseUnits(String(amount), decimals);
}
