import type { Metadata } from "next";
import { Droplets } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { listHeadClass } from "@/components/layout/listTable";
import { PoolPair } from "@/components/pool/PoolPair";
import { indexerActive } from "@/lib/stellar/indexer/client";
import { activeNetwork } from "@/lib/stellar/network";
import { getTopPools } from "@/lib/stellar/pools";
import { compactUsd } from "@/lib/format";

export const metadata: Metadata = { title: "Liquidity pools · Stellar Explorer" };

const usd = (n: number | null) => (n === null ? "–" : n < 1 ? "<$1" : compactUsd(n));

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

      <Card className="gap-0 p-0">
        {pools.length === 0 ? (
          <EmptyState message="No pools could be valued right now." />
        ) : (
          <Table>
            <TableHeader className={listHeadClass}>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 pl-4">#</TableHead>
                <TableHead>Pool</TableHead>
                <TableHead className="text-right">TVL</TableHead>
                <TableHead className="text-right">Volume 24h</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Fees 24h</TableHead>
                <TableHead className="hidden pr-4 text-right md:table-cell">LP accounts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pools.map((pool, i) => (
                <ClickableRow
                  key={pool.id}
                  href={`/pool/${pool.id}`}
                  label="Open pool"
                  className="border-b border-border last:border-b-0"
                >
                  <TableCell className="pl-4 text-dim tabular-nums">{i + 1}</TableCell>
                  <TableCell className="max-w-0 sm:max-w-none">
                    <PoolPair a={pool.a.identity} b={pool.b.identity} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {usd(pool.tvlUsd)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {pool.trades24h ? usd(pool.volume24hUsd) : <span className="text-dim">–</span>}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-sm tabular-nums sm:table-cell">
                    {pool.trades24h && pool.volume24hUsd !== null ? (
                      usd((pool.volume24hUsd * pool.feeBp) / 10_000)
                    ) : (
                      <span className="text-dim">–</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden pr-4 text-right tabular-nums md:table-cell">
                    {pool.accounts.toLocaleString("en-US")}
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
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
