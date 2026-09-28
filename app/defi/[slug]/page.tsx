import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Globe, ArrowLeft, Landmark, BarChart3, CalendarDays, CalendarRange } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/EmptyState";
import { ProtocolIcon } from "@/components/defi/ProtocolIcon";
import { ProtocolCharts } from "@/components/defi/ProtocolCharts";
import { DexTrades } from "@/components/defi/DexTrades";
import { DefiMenu } from "@/components/layout/DefiMenu";
import { StatTile } from "@/components/stats/StatTile";
import {
  getDexTrades,
  getProtocolDetail,
  getProtocolVolume,
  PROTOCOLS,
} from "@/lib/stellar/defi";
import { compactUsd } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = PROTOCOLS.find((p) => p.slug === slug)?.name ?? "Protocol";
  return { title: `${name} · Stellar Explorer` };
}

// DefiLlama fetches cache longer on their own; this keeps DEX trades fresh
export const revalidate = 60;

export function generateStaticParams() {
  return PROTOCOLS.map((p) => ({ slug: p.slug }));
}

// classic DEX trades come from Horizon. Soroban protocols need contract
// lists + a mainnet RPC first, so they get an honest empty state for now
const HAS_TRADES = new Set(["stellar-dex"]);

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [detail, volume, trades] = await Promise.all([
    getProtocolDetail(slug),
    getProtocolVolume(slug),
    HAS_TRADES.has(slug) ? getDexTrades() : Promise.resolve(null),
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/#defi"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-dim transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          DeFi on Stellar
        </Link>
        <DefiMenu
          align="end"
          label={
            <>
              <span className="text-dim">Protocols ({PROTOCOLS.length}):</span> {detail.name}
            </>
          }
          triggerClassName="rounded-md border border-border px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-surface-2"
        />
      </div>

      {/* identity */}
      <Card className="flex-row items-start gap-4 p-5">
        <span className="shrink-0 rounded-lg bg-surface-2 p-2">
          <ProtocolIcon logo={detail.logo} name={detail.name} />
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
        <Card className="p-5">
          <ProtocolCharts
            tvl={detail.tvlHistory}
            volume={volume?.chart ?? null}
            noVolumeMessage={
              detail.kind === "Lending"
                ? `${detail.name} is a lending protocol, so there's no trading volume to chart. Switch to TVL.`
                : "No volume feed for this protocol yet."
            }
          />
        </Card>
      </div>

      {/* on-chain activity */}
      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold">
            {HAS_TRADES.has(slug) ? "Latest trades" : "On-chain activity"}
          </h2>
          {HAS_TRADES.has(slug) && (
            <span className="text-xs text-dim">Orderbook and AMM pool fills, refreshed every minute</span>
          )}
        </div>
        {HAS_TRADES.has(slug) ? (
          <DexTrades trades={trades} />
        ) : (
          <EmptyState message={`Live ${detail.name} activity needs its contract addresses plus a mainnet RPC endpoint. That's next on the roadmap; the numbers above come from public data today.`} />
        )}
      </Card>
    </div>
  );
}
