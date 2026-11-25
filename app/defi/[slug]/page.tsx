import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Globe, ArrowLeft, ArrowLeftRight, Landmark, BarChart3, CalendarDays, CalendarRange, Boxes, Coins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/EmptyState";
import { ProtocolIcon } from "@/components/defi/ProtocolIcon";
import { StellarMark } from "@/components/stellar/StellarMark";
import { ProtocolCharts } from "@/components/defi/ProtocolCharts";
import { DexTrades } from "@/components/defi/DexTrades";
import { PoolActivityTable } from "@/components/defi/PoolActivityTable";
import { DefiMenu } from "@/components/layout/DefiMenu";
import { StatTile } from "@/components/stats/StatTile";
import {
  getDexTrades,
  getProtocolDetail,
  getProtocolVolume,
  PROTOCOLS,
  type TvlPoint,
} from "@/lib/stellar/defi";
import {
  getOrderBookTotals,
  getOrderBookTvlHistory,
  getOrderBookVolumeHistory,
  withLiveDay,
} from "@/lib/stellar/orderBook";
import {
  CLASSIC_POOLS,
  getProtocolActivity,
  getProtocolTotals,
  getProtocolTvlHistory,
  getProtocolVolumeHistory,
  tvlSeriesOf,
  volumeSeriesOf,
  type PoolProtocol,
} from "@/lib/stellar/pools";
import { CLASSIC_AMM } from "@/lib/stellar/protocols";
import { compactUsd, percentGap } from "@/lib/format";

const usd = (n: number) => (n === 0 ? "$0" : n < 1 ? "<$1" : compactUsd(n));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = [...PROTOCOLS, CLASSIC_AMM].find((p) => p.slug === slug)?.name ?? "Protocol";
  return { title: `${name} · Stellar Explorer` };
}

// DefiLlama fetches cache longer on their own; this keeps DEX trades fresh
export const revalidate = 60;

export function generateStaticParams() {
  return [...PROTOCOLS, CLASSIC_AMM].map((p) => ({ slug: p.slug }));
}

// the order book and the AMMs we index show their own numbers, charts and
// activity from our indexer, DefiLlama only in the comparison table where it
// lists them (it doesn't list Stellar's own pools). The order book's activity
// is its latest fills
const ORDER_BOOK = "stellar-dex";
const INDEXED: Record<string, PoolProtocol> = {
  [CLASSIC_AMM.slug]: "classic",
  "aquarius-stellar": "aquarius",
  soroswap: "soroswap",
};
// how far back the latest activity reaches, as getProtocolActivity reads it
const ACTIVITY_SPAN: Record<PoolProtocol, string> = { classic: "hour", aquarius: "3 days", soroswap: "3 days" };

// our figures for a protocol the index measures: its pools, or the order book
interface Own {
  tvlUsd: number;
  volume24hUsd: number;
  trades24h: number;
  tvl: TvlPoint[];
  volume: Array<{ date: number; volume: number }>;
}

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const indexed = INDEXED[slug];
  const orderBook = slug === ORDER_BOOK;
  const llamaListed = indexed !== "classic";
  const [detail, volume, trades, onchain, totals, tvlDays, volumeDays, book, bookTvl, bookVolume] = await Promise.all([
    getProtocolDetail(slug),
    llamaListed ? getProtocolVolume(slug) : Promise.resolve(null),
    orderBook ? getDexTrades() : Promise.resolve(null),
    indexed ? getProtocolActivity(indexed) : Promise.resolve(null),
    indexed ? getProtocolTotals() : Promise.resolve(null),
    indexed ? getProtocolTvlHistory() : Promise.resolve(null),
    indexed ? getProtocolVolumeHistory() : Promise.resolve(null),
    orderBook ? getOrderBookTotals() : Promise.resolve(null),
    orderBook ? getOrderBookTvlHistory() : Promise.resolve(null),
    orderBook ? getOrderBookVolumeHistory() : Promise.resolve(null),
  ]);

  if (!detail) {
    return (
      <EmptyState
        icon={SearchX}
        message={`"${slug}" isn't a protocol we track. The DeFi menu in the header lists the ones we do.`}
        className="py-24"
      />
    );
  }

  const change = volume?.change1d ?? null;
  const ours = totals?.find((t) => t.protocol === indexed) ?? null;
  // our own numbers lead whenever the indexer measures the protocol: pools it
  // could value, or the order book
  const pools = ours && ours.pools > 0 ? ours : null;
  const own: Own | null =
    indexed && pools
      ? {
          ...pools,
          tvl: tvlDays ? tvlSeriesOf(tvlDays, indexed) : [],
          volume: volumeDays ? volumeSeriesOf(volumeDays, indexed) : [],
        }
      : book
        ? {
            ...book,
            tvl: withLiveDay(bookTvl ?? [], book.tvlUsd),
            volume: bookVolume ?? [],
          }
        : null;
  const ownVolume = own?.volume ?? [];
  const lastDays = (n: number) => ownVolume.slice(-n);
  const volumeOver = (n: number) => lastDays(n).reduce((sum, d) => sum + d.volume, 0);
  const daysCaption = (n: number) => (lastDays(n).length < n ? `${lastDays(n).length} days indexed so far` : "USD, from our index");
  // we read only the most valuable classic pools, so a full read means there are more
  const poolCount = (n: number) => `${n.toLocaleString("en-US")}${indexed === "classic" && n >= CLASSIC_POOLS ? "+" : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/defi"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-dim transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          DeFi on Stellar
        </Link>
        <DefiMenu
          align="end"
          label={
            <>
              <span className="text-dim">Protocols ({PROTOCOLS.length + 1}):</span> {detail.name}
            </>
          }
          triggerClassName="rounded-md border border-border px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-surface-2"
        />
      </div>

      {/* identity */}
      <Card className="flex-row items-start gap-4 p-5">
        <span className="shrink-0 rounded-lg bg-surface-2 p-2">
          {detail.logo ? (
            <ProtocolIcon logo={detail.logo} name={detail.name} />
          ) : (
            <StellarMark className="size-5 shrink-0 text-foreground" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{detail.name}</h1>
            <Badge variant="outline" className="text-dim">
              {detail.kind}
            </Badge>
            <Badge variant="outline" className="text-dim">
              mainnet
            </Badge>
          </div>
          {detail.description && (
            <p className="mt-1 max-w-3xl text-sm text-dim">{detail.description}</p>
          )}
          {detail.website && (
            <a
              href={detail.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-gold hover:underline underline-offset-4"
            >
              <Globe className="size-3.5" aria-hidden="true" />
              {detail.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      </Card>

      {/* stats left, chart right */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)]">
        {own ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <StatTile
              label="Total value locked"
              info={
                book
                  ? "What open offers sell of XLM, USDC and other deeply traded assets, at prices from our own pools. An issuer's offers of its own asset don't count. From our index."
                  : `Both sides of every ${detail.name} pool we can value, at prices from our own pools. From our index.`
              }
              icon={Landmark}
              value={usd(own.tvlUsd)}
              caption={pools ? `${poolCount(pools.pools)} pools` : "on open offers"}
            />
            <StatTile
              label="Volume 24h"
              info={
                book
                  ? "Order book fills over the last 17,280 ledgers (about a day), valued at today's prices. An issuer handing over its own asset isn't counted. From our index."
                  : "Trades through those pools over the last 17,280 ledgers (about a day), valued at today's prices. From our index."
              }
              icon={BarChart3}
              value={usd(own.volume24hUsd)}
              caption={`${own.trades24h.toLocaleString("en-US")} trades`}
            />
            <StatTile
              label="Volume 7d"
              info="The last 7 complete UTC days, each at that day's prices. From our index."
              icon={CalendarDays}
              value={ownVolume.length ? usd(volumeOver(7)) : "–"}
              caption={daysCaption(7)}
            />
            <StatTile
              label="Volume 30d"
              info="The last 30 complete UTC days, each at that day's prices. From our index."
              icon={CalendarRange}
              value={ownVolume.length ? usd(volumeOver(30)) : "–"}
              caption={daysCaption(30)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <StatTile
              label="Total value locked"
              info="USD value of assets deposited in the protocol, from DefiLlama."
              icon={Landmark}
              value={detail.currentTvl !== null ? compactUsd(detail.currentTvl) : "–"}
              caption="USD"
            />
            <StatTile
              label="Volume 24h"
              info="USD traded through the protocol in the last 24 hours, from DefiLlama."
              icon={BarChart3}
              value={volume?.total24h != null ? compactUsd(volume.total24h) : "–"}
              caption={
                change !== null ? (
                  <span className={change >= 0 ? "text-ok" : "text-fail"}>
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(1)}% vs yesterday
                  </span>
                ) : (
                  "No volume feed"
                )
              }
            />
            <StatTile
              label="Volume 7d"
              icon={CalendarDays}
              value={volume?.total7d != null ? compactUsd(volume.total7d) : "–"}
              caption="USD"
            />
            <StatTile
              label="Volume 30d"
              icon={CalendarRange}
              value={volume?.total30d != null ? compactUsd(volume.total30d) : "–"}
              caption="USD"
            />
          </div>
        )}
        <Card className="p-5">
          {own ? (
            <ProtocolCharts
              tvl={own.tvl}
              volume={ownVolume.length ? ownVolume : null}
              tvlLabel={`${detail.name} ${book ? "value on offer" : "value locked"}, from our index`}
              volumeLabel={`${detail.name} daily volume, from our index`}
              noTvlMessage={`Not enough indexed days to chart ${detail.name}'s value yet.`}
              noVolumeMessage={`No daily volume indexed for ${book ? "the order book" : `the ${detail.name} pools`} yet. It fills in over the next refreshes.`}
            />
          ) : (
            <ProtocolCharts
              tvl={detail.tvlHistory}
              volume={volume?.chart ?? null}
              noVolumeMessage={
                detail.kind === "Lending"
                  ? `${detail.name} is a lending protocol, so there's no trading volume to chart. Switch to TVL.`
                  : "No volume feed for this protocol yet."
              }
            />
          )}
        </Card>
      </div>

      {(indexed || orderBook) && (
        <Card className="gap-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">From our index</h2>
            <span className="text-xs text-dim">
              The numbers above are ours, live from {orderBook ? "the order book" : `the ${detail.name} pools we can value`}
              {llamaListed ? ", set against DefiLlama." : ". DefiLlama doesn't list them."}{" "}
              <Link href="/defi" className="text-gold hover:underline underline-offset-4">
                Compare every protocol
              </Link>
            </span>
          </div>
          {own ? (
            <div className={llamaListed ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" : "grid gap-4"}>
              <div className={llamaListed ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 lg:grid-cols-4"}>
                {pools ? (
                  <>
                    <StatTile
                      label="Fees 24h"
                      info="Each pool's volume times its fee. Pools whose fee we haven't read yet count as none."
                      icon={Coins}
                      value={usd(pools.fees24hUsd)}
                      caption="paid by traders to the pools"
                    />
                    <StatTile
                      label="Pools"
                      info="Pools with a side we can price and confirm is really held."
                      icon={Boxes}
                      value={poolCount(pools.pools)}
                      caption={`${pools.trades24h.toLocaleString("en-US")} trades in 24h`}
                    />
                  </>
                ) : (
                  book && (
                    <>
                      <StatTile
                        label="Trades 24h"
                        info="Order book fills over the last 17,280 ledgers (about a day), an issuer handing over its own asset left out."
                        icon={ArrowLeftRight}
                        value={book.trades24h.toLocaleString("en-US")}
                        caption="fills on the order book"
                      />
                      <StatTile
                        label="Markets 24h"
                        info="Asset pairs with at least one fill over the last day, either way round."
                        icon={Boxes}
                        value={book.markets24h.toLocaleString("en-US")}
                        caption="pairs that traded"
                      />
                    </>
                  )
                )}
              </div>
              {llamaListed && (
                <ComparisonTable
                  rows={[
                    { label: "Value locked", ours: own.tvlUsd, theirs: detail.currentTvl },
                    { label: "Volume 24h", ours: own.volume24hUsd, theirs: volume?.total24h ?? null },
                    { label: "Volume 7d", ours: ownVolume.length >= 7 ? volumeOver(7) : null, theirs: volume?.total7d ?? null },
                  ]}
                />
              )}
            </div>
          ) : (
            <EmptyState
              message={
                totals
                  ? `None of the ${detail.name} pools we found could be valued right now.`
                  : `Couldn't load ${orderBook ? "the order book" : detail.name} totals from the indexer. They'll be back on the next refresh.`
              }
            />
          )}
        </Card>
      )}

      {/* on-chain activity */}
      <Card id="activity" className="scroll-mt-24 gap-0 p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold">
            {orderBook ? "Latest trades" : indexed ? "Latest activity" : "On-chain activity"}
          </h2>
          {orderBook && (
            <span className="text-xs text-dim">Order book fills, refreshed every minute</span>
          )}
          {indexed && onchain && (
            <span className="text-xs text-dim">
              Swaps, deposits and withdrawals across the {onchain.pools} {detail.name} pools we track, from our
              indexer.{" "}
              <Link href={`/liquidity-pools?type=${indexed}`} className="text-gold hover:underline underline-offset-4">
                See the pools
              </Link>
            </span>
          )}
        </div>
        {orderBook ? (
          <DexTrades trades={trades} />
        ) : !indexed ? (
          <EmptyState message={`${detail.name} activity isn't read from our indexer yet. The numbers above come from DefiLlama.`} />
        ) : !onchain ? (
          <EmptyState message={`Couldn't load ${detail.name} activity from the indexer. It'll be back on the next refresh.`} />
        ) : onchain.activity.length === 0 ? (
          <EmptyState message={`No swaps, deposits or withdrawals in the ${detail.name} pools we track over the last ${ACTIVITY_SPAN[indexed]}.`} />
        ) : (
          <div className="flex flex-col gap-3 px-5 pb-4">
            <PoolActivityTable activity={onchain.activity} topId="activity" />
          </div>
        )}
      </Card>
    </div>
  );
}

// our figures next to DefiLlama's, the comparison the numbers are checked by
function ComparisonTable({ rows }: { rows: Array<{ label: string; ours: number | null; theirs: number | null }> }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Our index compared with DefiLlama</caption>
        <thead className="bg-table-head text-xs uppercase tracking-wider text-dim">
          <tr className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-right [&_th]:font-medium [&_th]:whitespace-nowrap">
            <th className="!text-left">USD</th>
            <th>Our index</th>
            <th>DefiLlama</th>
            <th>Gap</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-right [&_td]:whitespace-nowrap">
              <td className="!text-left font-sans text-dim">{r.label}</td>
              <td>{r.ours === null ? "–" : usd(r.ours)}</td>
              <td>{r.theirs === null ? "–" : usd(r.theirs)}</td>
              <td className="text-dim">{r.ours !== null && r.theirs ? percentGap(r.ours, r.theirs) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
