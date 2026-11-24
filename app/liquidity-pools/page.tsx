import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Droplets, Layers, Repeat, Waves } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { PagedList } from "@/components/layout/PagedList";
import { PROTOCOL_LABEL, PoolPair } from "@/components/pool/PoolPair";
import { TypeTabs, type TypeTab } from "@/components/layout/TypeTabs";
import { indexerActive } from "@/lib/stellar/indexer/client";
import { activeNetwork } from "@/lib/stellar/network";
import { getTopPools, type PoolProtocol, type PoolSummary } from "@/lib/stellar/pools";
import { compactUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Liquidity pools · Stellar Explorer" };

const usd = (n: number | null) => (n === null ? "–" : n < 1 ? "<$1" : compactUsd(n));

type View = PoolProtocol | "all";
const TABS: TypeTab<View>[] = [
  { id: "all", label: "All pools", icon: Layers },
  { id: "classic", label: "Stellar AMM", icon: Droplets },
  { id: "soroswap", label: "Soroswap", icon: Repeat },
  { id: "aquarius", label: "Aquarius", icon: Waves },
];

// null is a pool without that figure (no trades today): it goes last either way
type Sort = "tvl" | "volume" | "fees";
type Dir = "desc" | "asc";
const SORTS: Record<Sort, (p: PoolSummary) => number | null> = {
  tvl: (p) => p.tvlUsd,
  volume: (p) => (p.trades24h ? (p.volume24hUsd ?? 0) : null),
  fees: (p) => (p.trades24h ? p.fees24hUsd : null),
};

function byColumn(sort: Sort, dir: Dir) {
  const value = SORTS[sort];
  const tvl = (p: PoolSummary) => p.tvlUsd ?? -1;
  return (x: PoolSummary, y: PoolSummary) => {
    const a = value(x);
    const b = value(y);
    if (a === null || b === null) return a === b ? tvl(y) - tvl(x) : a === null ? 1 : -1;
    return (dir === "asc" ? a - b : b - a) || tvl(y) - tvl(x);
  };
}

// the URL for a sort, keeping the protocol tab; TVL biggest first needs no params
function sortQuery(sort: Sort, dir: Dir): Record<string, string> {
  return { ...(sort !== "tvl" ? { sort } : {}), ...(dir === "asc" ? { dir } : {}) };
}

// fees and protocol drop out on narrow screens
const poolGrid =
  "grid grid-cols-[2rem_minmax(0,1fr)_5rem_5rem] items-center gap-x-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_6rem_5rem] md:grid-cols-[2.5rem_minmax(0,1fr)_7rem_7rem_6rem_7rem]";

export default async function LiquidityPoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string; dir?: string }>;
}) {
  const { type, sort: sortParam, dir: dirParam } = await searchParams;
  const view = TABS.find((t) => t.id === type)?.id ?? "all";
  const sort: Sort = sortParam === "volume" || sortParam === "fees" ? sortParam : "tvl";
  const dir: Dir = dirParam === "asc" ? "asc" : "desc";
  const [all, active, network] = await Promise.all([getTopPools(), indexerActive(), activeNetwork()]);
  const pools =
    all &&
    (view === "all" ? all : all.filter((p) => p.protocol === view)).slice().sort(byColumn(sort, dir));
  const head = { view, sort, dir };

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
          Stellar&apos;s built-in AMM pools and the Soroban pools of Soroswap and Aquarius, ranked
          by value locked. A pool is valued by its XLM, USDC or deeply priced side, at prices from
          our own pools, so a junk token can&apos;t inflate it. We list the 500 most valuable built-in
          pools and every Soroban pool we can value. Live, refreshed every two minutes.
        </p>
      </div>

      <TypeTabs
        tabs={TABS}
        active={view}
        basePath="/liquidity-pools"
        label="Pool protocol"
        keep={sortQuery(sort, dir)}
      />

      <Card id="pools" className="scroll-mt-24 gap-3 p-5 py-4">
        {pools.length === 0 ? (
          <EmptyState
            message={
              view === "all"
                ? "No pools could be valued right now."
                : `No ${PROTOCOL_LABEL[view]} pools could be valued right now.`
            }
          />
        ) : (
          <PagedList
            key={`${view}-${sort}-${dir}`}
            topId="pools"
            className="flex flex-col"
            header={
              <div
                className={`${poolGrid} border-b border-border pb-2 text-xs font-medium uppercase tracking-wider text-dim`}
              >
                <span>#</span>
                <span>Pool</span>
                <SortHead id="tvl" label="TVL" {...head} />
                <SortHead id="volume" label="Vol 24h" {...head} />
                <SortHead id="fees" label="Fees 24h" {...head} className="hidden sm:inline-flex" />
                <span className="hidden text-right md:block">Protocol</span>
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
                  {pool.trades24h && pool.fees24hUsd !== null ? (
                    usd(pool.fees24hUsd)
                  ) : (
                    <span className="text-dim">–</span>
                  )}
                </span>
                <span className="hidden text-right text-dim md:block">{PROTOCOL_LABEL[pool.protocol]}</span>
              </ClickableRow>
            ))}
          </PagedList>
        )}
      </Card>
      <p className="text-xs text-dim">
        {view === "all" ? `Top ${pools.length} by value.` : `${pools.length} of the top ${all!.length} by value.`}{" "}
        Volume counts trades routed through each pool in the last 24 hours, valued at today&apos;s
        prices; fees are what those trades paid at the pool&apos;s own rate: 0.30% on Stellar AMM
        and Soroswap pools, set per pool on Aquarius.
      </p>
    </div>
  );
}

// a column heading that sorts the list by itself, biggest first; clicking the
// current one flips the order
function SortHead({
  id,
  label,
  view,
  sort,
  dir,
  className,
}: {
  id: Sort;
  label: string;
  view: View;
  sort: Sort;
  dir: Dir;
  className?: string;
}) {
  const current = id === sort;
  const next: Dir = current && dir === "desc" ? "asc" : "desc";
  const qs = new URLSearchParams({
    ...(view !== "all" ? { type: view } : {}),
    ...sortQuery(id, next),
  }).toString();
  const Icon = !current ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={qs ? `/liquidity-pools?${qs}` : "/liquidity-pools"}
      scroll={false}
      aria-label={`Sort by ${label}, ${next === "asc" ? "smallest" : "biggest"} first`}
      aria-current={current ? "true" : undefined}
      className={cn(
        "group/sort inline-flex items-center justify-end gap-1 rounded-sm uppercase transition-colors duration-150",
        current ? "text-foreground" : "hover:text-foreground",
        className,
      )}
    >
      <Icon
        className={cn("size-3", !current && "opacity-40 group-hover/sort:opacity-100")}
        aria-hidden="true"
      />
      {label}
    </Link>
  );
}
