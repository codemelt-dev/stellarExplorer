import type { Metadata } from "next";
import { Droplets } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { PagedList } from "@/components/layout/PagedList";
import { PoolPair } from "@/components/pool/PoolPair";
import { indexerActive } from "@/lib/stellar/indexer/client";
import { activeNetwork } from "@/lib/stellar/network";
import { getTopPools } from "@/lib/stellar/pools";
import { compactUsd } from "@/lib/format";

export const metadata: Metadata = { title: "Liquidity pools · Stellar Explorer" };

const usd = (n: number | null) => (n === null ? "–" : n < 1 ? "<$1" : compactUsd(n));

// fees and LP accounts drop out on narrow screens
const poolGrid =
  "grid grid-cols-[2rem_minmax(0,1fr)_5rem_5rem] items-center gap-x-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_6rem_5rem] md:grid-cols-[2.5rem_minmax(0,1fr)_7rem_7rem_6rem_7rem]";

export default async function LiquidityPoolsPage() {
  const [pools, active, network] = await Promise.all([getTopPools(), indexerActive(), activeNetwork()]);

  if (!pools) {
    return active ? (
      <ErrorState
        message="The indexer didn't respond while loading pools. Reload the page to retry."
        className="py-24"
      />
    ) : (
      <EmptyState
        icon={Droplets}
        message={`Pool rankings come from the indexer, which covers mainnet only. Switch to Mainnet in the top bar; ${network.label.toLowerCase()} pools still show up in transactions.`}
        className="py-24"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Liquidity pools</h1>
        <p className="max-w-3xl text-sm text-dim">
          Stellar&apos;s built-in AMM pools, ranked by value locked. A pool is valued by its XLM,
          USDC or deeply priced side, at prices from our own pools, so a junk token can&apos;t
          inflate it. Live, refreshed every two minutes.
        </p>
      </div>

      <Card id="pools" className="scroll-mt-24 gap-3 p-5 py-4">
        {pools.length === 0 ? (
          <EmptyState message="No pools could be valued right now." />
        ) : (
          <PagedList
            topId="pools"
            className="flex flex-col"
            header={
              <div
                className={`${poolGrid} border-b border-border pb-2 text-xs font-medium uppercase tracking-wider text-dim`}
              >
                <span>#</span>
                <span>Pool</span>
                <span className="text-right">TVL</span>
                <span className="text-right">Vol 24h</span>
                <span className="hidden text-right sm:block">Fees 24h</span>
                <span className="hidden text-right md:block">LP accounts</span>
              </div>
            }
          >
            {pools.map((pool, i) => (
              <ClickableRow
                key={pool.id}
                as="div"
                href={`/pool/${pool.id}`}
                label="Open pool"
                className={`${poolGrid} h-12 border-b border-border text-sm last:border-b-0`}
              >
                <span className="text-dim tabular-nums">{i + 1}</span>
                <PoolPair a={pool.a.identity} b={pool.b.identity} />
                <span className="text-right font-mono tabular-nums">{usd(pool.tvlUsd)}</span>
                <span className="text-right font-mono tabular-nums">
                  {pool.trades24h ? usd(pool.volume24hUsd) : <span className="text-dim">–</span>}
                </span>
                <span className="hidden text-right font-mono tabular-nums sm:block">
                  {pool.trades24h && pool.volume24hUsd !== null ? (
                    usd((pool.volume24hUsd * pool.feeBp) / 10_000)
                  ) : (
                    <span className="text-dim">–</span>
                  )}
                </span>
                <span className="hidden text-right tabular-nums md:block">
                  {pool.accounts.toLocaleString("en-US")}
                </span>
              </ClickableRow>
            ))}
          </PagedList>
        )}
      </Card>
      <p className="text-xs text-dim">
        Top {pools.length} by value. Volume counts trades routed through each pool in the last
        24 hours, valued at today&apos;s prices; fees are the pool&apos;s 0.30% of it, paid to
        its liquidity providers.
      </p>
    </div>
  );
}
