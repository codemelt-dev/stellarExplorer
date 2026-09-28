import type { Metadata } from "next";
import { Coins } from "lucide-react";
import { ComingSoon } from "@/components/states/ComingSoon";

export const metadata: Metadata = { title: "Assets · Stellar Explorer" };

export default function AssetsPage() {
  return (
    <ComingSoon
      icon={Coins}
      title="Assets"
      description="A ranked directory of Stellar assets. Horizon only lists assets alphabetically, so ranking by holders and volume needs our own indexer."
      planned={[
        "Assets ranked by holders, supply and 24h volume",
        "Issuer identity and icons from stellar.toml",
        "Per-asset pages with holders, trades and supply history",
      ]}
      meanwhile="Search already finds assets by code. Try USDC."
    />
  );
}
