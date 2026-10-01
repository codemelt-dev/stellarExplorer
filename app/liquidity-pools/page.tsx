import type { Metadata } from "next";
import { Droplets } from "lucide-react";
import { ComingSoon } from "@/components/states/ComingSoon";

export const metadata: Metadata = { title: "Liquidity pools · Stellar Explorer" };

export default function LiquidityPoolsPage() {
  return (
    <ComingSoon
      icon={Droplets}
      title="Liquidity pools"
      description="Stellar's built-in AMM pools, ranked by what matters. Horizon lists pools but can't sort them by reserves or volume, so ranking lands with our own indexer."
      planned={[
        "Pools ranked by total value locked and 24h volume",
        "Reserves, share price and fee earnings per pool",
        "Deposit and withdrawal history per pool and per account",
      ]}
      meanwhile="Pool deposits and withdrawals already show up decoded in transactions and account history."
    />
  );
}
