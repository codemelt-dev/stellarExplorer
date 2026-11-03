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
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { StatTile } from "@/components/stats/StatTile";
import { ProtocolIcon } from "@/components/defi/ProtocolIcon";
import { TvlChart } from "@/components/defi/TvlChart";
import { listHeadClass } from "@/components/layout/listTable";
import { PROTOCOL_LABEL } from "@/components/pool/PoolPair";
import { getProtocols, PROTOCOLS, type ProtocolRow, type TvlBreakdownRow } from "@/lib/stellar/defi";
import {
  getProtocolTotals,
  getProtocolTvlHistory,
  type PoolProtocol,
  type ProtocolDay,
  type ProtocolTotals,
} from "@/lib/stellar/pools";
import { protocolLogo } from "@/lib/stellar/protocols";
import { compactUsd, percentGap } from "@/lib/format";

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

interface Row {
  key: string;
  name: string;
  kind: string;
  href: string;
  logo: string | null;
  indexed: boolean;
  ours: ProtocolTotals | null;
  llama: ProtocolRow | null;
}

export default async function DefiPage() {
  const [totals, llama, history] = await Promise.all([getProtocolTotals(), getProtocols(), getProtocolTvlHistory()]);
  const llamaBySlug = new Map(llama.map((p) => [p.slug, p]));

  const indexedRows: Row[] = INDEXED.map(({ protocol, slug }) => {
    const meta = PROTOCOLS.find((p) => p.slug === slug);
    return {
      key: protocol,
      name: PROTOCOL_LABEL[protocol],
      kind: meta?.kind ?? "Classic AMM pools",
      href: slug ? `/defi/${slug}` : "/liquidity-pools?type=classic",
      logo: slug && protocolLogo(slug),
      indexed: true,
      ours: totals?.find((t) => t.protocol === protocol) ?? null,
      llama: (slug && llamaBySlug.get(slug)) || null,
    };
  });
  const otherRows: Row[] = PROTOCOLS.filter((p) => !INDEXED.some((i) => i.slug === p.slug)).map((p) => ({
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
  const both = indexedRows.filter((r) => r.ours && r.ours.pools > 0 && r.llama?.tvl);
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
          <span className="ml-auto text-xs text-dim">data: Astrolabe · DefiLlama</span>
        </div>
        <p className="max-w-3xl text-sm text-dim">
          Value locked and trading in Stellar&apos;s AMM pools, computed from our own index: the
          classic pools and the Soroban pools of Aquarius and Soroswap. DefiLlama&apos;s figures sit
          next to ours for comparison.
        </p>
      </div>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Value locked"
            info="Both sides of every pool we can value, at prices from our own pools."
            value={usd(sum((t) => t.tvlUsd))}
            caption={`${sum((t) => t.pools).toLocaleString("en-US")} pools`}
            icon={Droplets}
          />
          <StatTile
            label="Volume 24h"
            info="Trades through those pools over the last 17,280 ledgers (about a day), valued at today's prices."
            value={usd(sum((t) => t.volume24hUsd))}
            caption={`${sum((t) => t.trades24h).toLocaleString("en-US")} trades`}
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

      <HistoryCard history={history} />

      <section id="protocols" className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="text-lg font-semibold">By protocol</h2>
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader className={listHeadClass}>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Protocol</TableHead>
                <TableHead className="text-right">Pools</TableHead>
                <TableHead className="text-right">TVL, ours</TableHead>
                <TableHead className="text-right">TVL, DefiLlama</TableHead>
                <TableHead className="text-right">Gap</TableHead>
                <TableHead className="text-right">Vol 24h, ours</TableHead>
                <TableHead className="pr-4 text-right">Vol 24h, DefiLlama</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const counted = r.ours !== null && r.ours.pools > 0;
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
                      {counted ? r.ours!.pools.toLocaleString("en-US") : "–"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {!r.indexed ? (
                        <span className="font-sans text-xs text-dim">not indexed yet</span>
                      ) : counted ? (
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
                      {counted && r.llama?.tvl ? percentGap(r.ours!.tvlUsd, r.llama.tvl) : "–"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {counted ? usd(r.ours!.volume24hUsd) : "–"}
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">How we count</h2>
        <Card className="p-5">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-dim">
            <li>
              Reserves are live from our indexer: the classic pools&apos; own state, Soroswap&apos;s{" "}
              <span className="font-mono">sync</span> events and Aquarius&apos;s reserve and price
              events. We count the 500 most valuable classic pools and every Aquarius and Soroswap
              pool we find.
            </li>
            <li>
              Prices come from our own pools. A pool counts once one side is XLM, USDC or another
              deeply traded asset and that side is really held, so a pool of unpriced tokens
              isn&apos;t counted and a junk token can&apos;t inflate one.
            </li>
            <li>
              DefiLlama prices tokens from outside markets and reads Aquarius&apos;s pool list from its
              router, so small gaps come from prices and from pools only one of us counts. Its
              Stellar DEX figure is open orderbook offers, not pools, and it doesn&apos;t list the
              classic AMM pools at all.
            </li>
            <li>
              Our index starts on 6 October 2026, so the chart above does too and grows with the
              history backfill. The charts on the protocol pages still come from DefiLlama.{" "}
              <Link href="/liquidity-pools" className="text-gold hover:underline underline-offset-4">
                See every pool
              </Link>
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

const day = (date: number) => new Date(date * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function HistoryCard({ history }: { history: ProtocolDay[] | null }) {
  const points = (history ?? []).map((d) => ({
    date: d.date,
    tvl: INDEXED.reduce((s, { protocol }) => s + d.tvl[protocol], 0),
  }));
  // the tooltip splits each day by protocol, biggest first
  const breakdown: Record<number, TvlBreakdownRow[]> = {};
  for (const d of history ?? []) {
    breakdown[Math.floor(d.date / 86400)] = INDEXED.filter(({ protocol }) => d.tvl[protocol] > 0)
      .map(({ protocol, slug }) => ({
        slug: protocol,
        name: PROTOCOL_LABEL[protocol],
        logo: slug && protocolLogo(slug),
        tvl: d.tvl[protocol],
      }))
      .sort((x, y) => y.tvl - x.tvl);
  }
  return (
    <Card className="tile gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Value locked over time</h2>
        {points.length > 1 && (
          <span className="text-xs uppercase tracking-wider text-dim">
            {day(points[0].date)} to {day(points[points.length - 1].date)}
          </span>
        )}
      </div>
      {points.length > 1 ? (
        <>
          <TvlChart points={points} breakdown={breakdown} label="Value locked in the pools we index" />
          <p className="text-xs text-dim">
            At the end of each UTC day, at that day&apos;s prices from our own pools: classic pools
            rebuilt from every transfer in and out, Soroban pools from their reserves events. It
            follows today&apos;s pools back as far as our index goes; a quiet Soroban pool joins at
            its first reserves update.
          </p>
        </>
      ) : history ? (
        <EmptyState message="Our index doesn't have two full days to chart yet." />
      ) : (
        <ErrorState message="Couldn't rebuild the history from the indexer. It'll be back on the next refresh." className="py-6" />
      )}
    </Card>
  );
}
