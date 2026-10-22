import type { Metadata } from "next";
import { ChartLine } from "lucide-react";
import { ComingSoon } from "@/components/states/ComingSoon";

export const metadata: Metadata = { title: "Analytics · Stellar Explorer" };

export default function AnalyticsPage() {
  return (
    <ComingSoon
      icon={ChartLine}
      title="Analytics"
      description="Long-range network history from the Astrolabe indexer, once its full history backfill lands."
      planned={[
        "Transactions, operations and fees over time",
        "Active accounts and new account growth",
        "Soroban usage: invocations, resource fees and top contracts",
      ]}
      meanwhile="Live network stats are on the home page right now."
    />
  );
}
