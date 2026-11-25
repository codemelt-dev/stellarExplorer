import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Droplets, Scale, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { StellarMark } from "@/components/stellar/StellarMark";
import { ErrorState } from "@/components/states/ErrorState";
import { StatTile } from "@/components/stats/StatTile";
import { ProtocolIcon } from "@/components/defi/ProtocolIcon";
import { ProtocolCharts } from "@/components/defi/ProtocolCharts";
import { listHeadClass } from "@/components/layout/listTable";
import { InfoHint } from "@/components/layout/InfoHint";
import { PROTOCOL_LABEL } from "@/components/pool/PoolPair";
import { getProtocols, PROTOCOLS, type ProtocolRow, type TvlBreakdownRow } from "@/lib/stellar/defi";
import {
  CLASSIC_POOLS,
  getProtocolTotals,
  getProtocolTvlHistory,
  getProtocolVolumeHistory,
  type PoolProtocol,
  type ProtocolDay,
  type ProtocolVolumeDay,
  type ProtocolTotals,
} from "@/lib/stellar/pools";
import { getOrderBookTotals } from "@/lib/stellar/orderBook";
import { CLASSIC_AMM, protocolLogo } from "@/lib/stellar/protocols";
import { compactUsd, percentGap } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "DeFi on Stellar · Stellar Explorer" };

// our totals cache for two minutes, DefiLlama's for longer
export const revalidate = 120;

const usd = (n: number) => (n === 0 ? "$0" : n < 1 ? "<$1" : compactUsd(n));

// the protocols we read from our own index, and their DefiLlama slug
const INDEXED: Array<{ protocol: PoolProtocol; slug: string | null }> = [
  { protocol: "classic", slug: null },
  { protocol: "aquarius", slug: "aquarius-stellar" },
  { protocol: "soroswap", slug: "soroswap" },
];

const ORDER_BOOK = "stellar-dex";

// our figures for a protocol; the order book has no pools to count
interface Ours {
  pools: number | null;
  tvlUsd: number;
  volume24hUsd: number;
}

interface Row {
  key: string;
  name: string;
  kind: string;
  href: string;
  logo: string | null;
  indexed: boolean;
  ours: Ours | null;
  llama: ProtocolRow | null;
}

// we read only the most valuable classic pools, so a full read means there are more
const capped = (r: Row) => r.key === "classic" && (r.ours?.pools ?? 0) >= CLASSIC_POOLS;

// the index measured it: pools found, or value on the order book
const counted = (r: Row) => r.ours !== null && (r.ours.pools === null ? r.ours.tvlUsd > 0 : r.ours.pools > 0);

export default async function DefiPage() {
  const [totals, llama, history, volume, orderBook] = await Promise.all([
    getProtocolTotals(),
    getProtocols(),
    getProtocolTvlHistory(),
    getProtocolVolumeHistory(),
    getOrderBookTotals(),
  ]);
  const llamaBySlug = new Map(llama.map((p) => [p.slug, p]));

  const dex = PROTOCOLS.find((p) => p.slug === ORDER_BOOK)!;
  const orderBookRow: Row = {
    key: ORDER_BOOK,
    name: dex.name,
    kind: dex.kind,
    href: `/defi/${ORDER_BOOK}`,
    logo: protocolLogo(ORDER_BOOK),
    indexed: true,
    ours: orderBook && { pools: null, tvlUsd: orderBook.tvlUsd, volume24hUsd: orderBook.volume24hUsd },
    llama: llamaBySlug.get(ORDER_BOOK) ?? null,
  };
  const poolRows: Row[] = INDEXED.map(({ protocol, slug }) => {
    const meta = PROTOCOLS.find((p) => p.slug === slug);
    return {
      key: protocol,
      name: PROTOCOL_LABEL[protocol],
      kind: meta?.kind ?? CLASSIC_AMM.kind,
      href: slug ? `/defi/${slug}` : CLASSIC_AMM.href,
      logo: slug && protocolLogo(slug),
      indexed: true,
      ours: totals?.find((t) => t.protocol === protocol) ?? null,
      llama: (slug && llamaBySlug.get(slug)) || null,
    };
  });
  const indexedRows = [...poolRows, orderBookRow];
  const otherRows: Row[] = PROTOCOLS.filter(
    (p) => p.slug !== ORDER_BOOK && !INDEXED.some((i) => i.slug === p.slug),
  ).map((p) => ({
    key: p.slug,
    name: p.name,
    kind: p.kind,
    href: `/defi/${p.slug}`,
    logo: protocolLogo(p.slug),
    indexed: false,
    ours: null,
    llama: llamaBySlug.get(p.slug) ?? null,
  }));
  const rows = [
    ...indexedRows.sort((x, y) => (y.ours?.tvlUsd ?? 0) - (x.ours?.tvlUsd ?? 0)),
    ...otherRows.sort((x, y) => (y.llama?.tvl ?? 0) - (x.llama?.tvl ?? 0)),
  ];

  const sum = (value: (t: ProtocolTotals) => number) => (totals ?? []).reduce((s, t) => s + value(t), 0);
  // the comparison only counts protocols both sides measure
  const both = indexedRows.filter((r) => counted(r) && r.llama?.tvl);
  const oursBoth = both.reduce((s, r) => s + r.ours!.tvlUsd, 0);
  const llamaBoth = both.reduce((s, r) => s + r.llama!.tvl!, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">DeFi on Stellar</h1>
          <Badge variant="outline" className="text-dim">
            mainnet
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-dim">
          Value locked and trading on Stellar&apos;s exchanges, computed from our own index: the
          order book, the classic pools and the Soroban pools of Aquarius and Soroswap.
          DefiLlama&apos;s figures sit next to ours for comparison.
        </p>
      </div>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Value locked"
            info="Both sides of every pool we can value, plus what open offers sell on the order book, at prices from our own pools."
            value={usd(sum((t) => t.tvlUsd) + (orderBook?.tvlUsd ?? 0))}
            caption={`${sum((t) => t.pools).toLocaleString("en-US")}${totals.some((t) => t.protocol === "classic" && t.pools >= CLASSIC_POOLS) ? "+" : ""} pools${orderBook?.tvlUsd ? " and the order book" : ""}`}
            icon={Droplets}
          />
          <StatTile
            label="Volume 24h"
            info="Trades through those pools and fills on the order book over the last 17,280 ledgers (about a day), valued at today's prices."
            value={usd(sum((t) => t.volume24hUsd) + (orderBook?.volume24hUsd ?? 0))}
            caption={`${(sum((t) => t.trades24h) + (orderBook?.trades24h ?? 0)).toLocaleString("en-US")} trades`}
            icon={TrendingUp}
          />
          <StatTile
            label="Fees 24h"
            info="Each pool's volume times its fee. Aquarius pools whose fee we haven't read yet count as none."
            value={usd(sum((t) => t.fees24hUsd))}
            caption="paid by traders to the pools"
            icon={Coins}
          />
          <StatTile
            label="Ours vs DefiLlama"
            info="Our value locked against DefiLlama's, over the protocols both of us measure."
            value={both.length ? percentGap(oursBoth, llamaBoth) : "–"}
            caption={
              both.length
                ? `${compactUsd(oursBoth)} vs ${compactUsd(llamaBoth)}, ${both.map((r) => r.name).join(" and ")}`
                : "no protocol both of us measure right now"
            }
            icon={Scale}
          />
        </div>
      ) : (
        <Card className="p-5">
          <ErrorState
            message="Couldn't load our pool totals from the indexer. Reload the page to retry; DefiLlama's figures are below."
            className="py-6"
          />
        </Card>
      )}

      <HistoryCard tvl={history} volume={volume} />

      <section id="protocols" className="flex scroll-mt-24 flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold">By protocol</h2>
          <InfoHint label="By protocol">{HINT.byProtocol}</InfoHint>
          <Link
            href="/liquidity-pools"
            className="ml-auto text-xs text-gold underline-offset-4 hover:underline"
          >
            See every pool
          </Link>
        </div>
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader className={listHeadClass}>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Protocol</TableHead>
                <HintedHead label="Pools" hint={HINT.pools} />
                <HintedHead label="TVL, ours" hint={HINT.tvlOurs} />
                <HintedHead label="TVL, DefiLlama" hint={HINT.llama} />
                <TableHead className="text-right">Gap</TableHead>
                <HintedHead label="Vol 24h, ours" hint={HINT.volumeOurs} />
                <HintedHead label="Vol 24h, DefiLlama" hint={HINT.llama} className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const measured = counted(r);
                return (
                  <ClickableRow
                    key={r.key}
                    href={r.href}
                    label={`Open ${r.name}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <TableCell className="pl-4">
                      <span className="flex min-w-0 items-center gap-2.5">
                        {r.logo ? (
                          <ProtocolIcon logo={r.logo} name={r.name} />
                        ) : (
                          <StellarMark className="size-5 shrink-0 text-foreground" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm leading-tight">{r.name}</span>
                          <span className="block truncate text-xs leading-tight text-dim">{r.kind}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-dim tabular-nums">
                      {measured && r.ours!.pools !== null
                        ? `${r.ours!.pools.toLocaleString("en-US")}${capped(r) ? "+" : ""}`
                        : "–"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {!r.indexed ? (
                        <span className="font-sans text-xs text-dim">not indexed yet</span>
                      ) : measured ? (
                        usd(r.ours!.tvlUsd)
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.llama?.tvl != null ? (
                        compactUsd(r.llama.tvl)
                      ) : r.key === "classic" ? (
                        <span className="font-sans text-xs text-dim">not listed</span>
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-dim tabular-nums">
                      {measured && r.llama?.tvl ? percentGap(r.ours!.tvlUsd, r.llama.tvl) : "–"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {measured ? usd(r.ours!.volume24hUsd) : "–"}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono tabular-nums">
                      {r.llama?.volume24h ? compactUsd(r.llama.volume24h) : "–"}
                    </TableCell>
                  </ClickableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
        {llama.length === 0 && (
          <p className="text-xs text-dim">
            Couldn&apos;t reach DefiLlama, so its columns are empty. They fill in on the next refresh.
          </p>
        )}
      </section>
    </div>
  );
}

// how each figure in the table is made, behind the ? beside its heading
const HINT = {
  pools:
    "Reserves are live from our indexer: the classic pools' own state, Soroswap's sync events and Aquarius's reserve and price events. We count the 500 most valuable classic pools and every Aquarius and Soroswap pool we find.",
  tvlOurs:
    "Prices come from our own pools. A pool counts once one side is XLM, USDC or another deeply traded asset and that side is really held, so a pool of unpriced tokens isn't counted and a junk token can't inflate one. The order book's value locked is what open offers sell of those assets; an issuer's offers of its own asset don't count.",
  volumeOurs:
    "Each trade is valued by its XLM, USDC or deeply traded side, at prices from our own pools. Order book fills where an issuer hands over its own asset don't count: that's issuing, not trading.",
  llama:
    "DefiLlama prices tokens from outside markets and reads Aquarius's pool list from its router, so small gaps come from prices and from pools only one of us counts. It doesn't list the classic AMM pools at all.",
  byProtocol:
    "The chart above covers the last 90 days from our own index, and so do the Stellar AMM, Stellar DEX, Aquarius and Soroswap pages, with DefiLlama only in their comparison table. The other protocol pages use DefiLlama.",
};

function HintedHead({ label, hint, className }: { label: string; hint: string; className?: string }) {
  return (
    <TableHead className={cn("text-right", className)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <InfoHint label={label}>{hint}</InfoHint>
      </span>
    </TableHead>
  );
}


// each day split by protocol for the tooltip, biggest first
function split(values: Record<PoolProtocol, number>): TvlBreakdownRow[] {
  return INDEXED.filter(({ protocol }) => values[protocol] > 0)
    .map(({ protocol, slug }) => ({
      slug: protocol,
      name: PROTOCOL_LABEL[protocol],
      logo: slug && protocolLogo(slug),
      tvl: values[protocol],
    }))
    .sort((x, y) => y.tvl - x.tvl);
}

const sumOf = (values: Record<PoolProtocol, number>) => INDEXED.reduce((s, { protocol }) => s + values[protocol], 0);
const dayKey = (date: number) => Math.floor(date / 86400);

function HistoryCard({ tvl, volume }: { tvl: ProtocolDay[] | null; volume: ProtocolVolumeDay[] | null }) {
  const failed = "Couldn't rebuild the history from the indexer. It'll be back on the next refresh.";
  return (
    <Card className="tile gap-3 p-5">
      <ProtocolCharts
        initialMetric="tvl"
        tvl={(tvl ?? []).map((d) => ({ date: d.date, tvl: sumOf(d.tvl) }))}
        volume={(volume ?? []).map((d) => ({ date: d.date, volume: sumOf(d.volume) }))}
        tvlBreakdown={Object.fromEntries((tvl ?? []).map((d) => [dayKey(d.date), split(d.tvl)]))}
        volumeBreakdown={Object.fromEntries((volume ?? []).map((d) => [dayKey(d.date), split(d.volume)]))}
        tvlLabel="Value locked in the pools we index"
        volumeLabel="Daily volume through the pools we index"
        noTvlMessage={tvl ? "Our index doesn't have two full days to chart yet." : failed}
        noVolumeMessage={volume ? "Our index doesn't have a complete day of trades yet." : failed}
      />
      <p className="text-xs text-dim">
        Per UTC day at that day&apos;s prices from our own pools; hover a day to split it by
        protocol. Value locked is at the end of the day, classic pools rebuilt from every transfer in
        and out and Soroban pools from their reserves events; volume is every trade through the same
        pools over the day. It follows today&apos;s pools back as far as our index goes.
      </p>
    </Card>
  );
}
