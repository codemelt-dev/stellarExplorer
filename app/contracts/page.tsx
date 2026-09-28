import type { Metadata } from "next";
import { FileCode2 } from "lucide-react";
import { ComingSoon } from "@/components/states/ComingSoon";

export const metadata: Metadata = { title: "Contracts · Stellar Explorer" };

export default function ContractsPage() {
  return (
    <ComingSoon
      icon={FileCode2}
      title="Contracts"
      description="A browsable list of every Soroban contract on the network. Horizon and RPC can't list contracts, so this lands with our own indexer."
      planned={[
        "All deployed contracts, sorted by recent activity",
        "Invocation counts and unique callers over time",
        "Filters for token contracts, DeFi protocols and verified WASM",
      ]}
      meanwhile="Contract pages already work. Paste a C… address to open one."
    />
  );
}
