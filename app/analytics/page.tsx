import type { Metadata } from "next";
import Link from "next/link";
import { ChartLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Address } from "@/components/stellar/Address";
import { AssetLabel } from "@/components/stellar/AssetLabel";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { AnalyticsBoard } from "@/components/analytics/AnalyticsBoard";
import { getNetworkDays, getTopContracts, TOP_CONTRACT_DAYS, type TopContract } from "@/lib/stellar/analytics";
import { compactNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics · Stellar Explorer" };

// the numbers are per complete day, cached for the hour
export const revalidate = 600;

export default async function AnalyticsPage() {
  const [days, top] = await Promise.all([getNetworkDays(), getTopContracts()]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <Badge variant="outline" className="text-dim">
            mainnet
          </Badge>
          <span className="ml-auto text-xs text-dim">data: Astrolabe</span>
        </div>
        <p className="max-w-3xl text-sm text-dim">
          The network day by day, from our own index: transactions, operations, accounts, fees and
          Soroban usage for every complete UTC day. Our index starts on 6 October 2026, so the
          history does too and grows as the backfill lands.
        </p>
      </div>

      {!days ? (
        <Card className="p-5">
          <ErrorState message="Couldn't load the network history from the indexer. Reload the page to retry." />
        </Card>
      ) : days.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon={ChartLine} message="The indexer doesn't have a complete day yet. Come back tomorrow." />
        </Card>
      ) : (
        <AnalyticsBoard days={days} />
      )}

      <TopContracts top={top} />
    </div>
  );
}

function TopContracts({ top }: { top: TopContract[] | null }) {
  return (
    <section aria-label="Most called contracts" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Most called contracts</h2>
        <span className="text-xs text-dim">
          last {TOP_CONTRACT_DAYS} days ·{" "}
          <Link href="/contracts" className="text-gold hover:underline underline-offset-4">
            All contracts
          </Link>
        </span>
      </div>
      <Card className="gap-0 p-5 py-2">
        {!top ? (
          <ErrorState message="Couldn't load contract calls from the indexer. Reload the page to retry." className="py-6" />
        ) : top.length === 0 ? (
          <EmptyState message={`No contract calls in the last ${TOP_CONTRACT_DAYS} days.`} />
        ) : (
          <>
            <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_5rem_5rem] items-center gap-x-3 border-b border-border py-2 text-xs font-medium uppercase tracking-wider text-dim">
              <span>#</span>
              <span>Contract</span>
              <span className="text-right">Calls</span>
              <span className="text-right" title="Distinct accounts and contracts that called it">
                Callers
              </span>
            </div>
            {top.map((c, i) => (
              <div
                key={c.contractId}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_5rem_5rem] items-center gap-x-3 border-b border-border py-2.5 last:border-b-0"
              >
                <span className="font-mono text-xs text-dim">{i + 1}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  {c.asset ? (
                    <>
                      <AssetLabel identity={c.asset} />
                      <Badge variant="outline" className="font-mono text-[11px] text-dim">
                        asset contract
                      </Badge>
                    </>
                  ) : (
                    <Address address={c.contractId} chars={6} copy={false} />
                  )}
                </span>
                <span className="text-right font-mono text-sm tabular-nums">{compactNumber(c.calls)}</span>
                <span className="text-right font-mono text-sm text-dim tabular-nums">{compactNumber(c.callers)}</span>
              </div>
            ))}
          </>
        )}
      </Card>
    </section>
  );
}
