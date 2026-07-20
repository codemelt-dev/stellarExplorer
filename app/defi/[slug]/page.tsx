import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Globe, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/EmptyState";
import { TvlChart } from "@/components/defi/TvlChart";
import { VolumeChart } from "@/components/defi/VolumeChart";
import { ProtocolIcon } from "@/components/defi/ProtocolIcon";
import {
  getProtocolDetail,
  getProtocolVolume,
  PROTOCOLS,
} from "@/lib/stellar/defi";
import { compactUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = PROTOCOLS.find((p) => p.slug === slug)?.name ?? "Protocol";
  return { title: `${name} · Stellar Explorer` };
}

export const revalidate = 900;

export function generateStaticParams() {
  return PROTOCOLS.map((p) => ({ slug: p.slug }));
}

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [detail, volume] = await Promise.all([
    getProtocolDetail(slug),
    getProtocolVolume(slug),
  ]);

  if (!detail) {
    return (
      <EmptyState
        icon={SearchX}
        message={`"${slug}" isn't a protocol we track. The DeFi section on the home page lists the ones we do.`}
        className="py-24"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-dim transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        DeFi on Stellar
      </Link>

      {/* identity */}
      <div className="flex items-start gap-4">
        <span className="mt-0.5 shrink-0 rounded-lg bg-surface p-2">
          <ProtocolIcon logo={detail.logo} name={detail.name} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {detail.name}
            </h1>
            <Badge variant="outline" className="text-dim">
              {detail.kind}
            </Badge>
            <Badge variant="outline" className="text-dim">
              mainnet
            </Badge>
          </div>
          {detail.description && (
            <p className="mt-1 max-w-2xl text-sm text-dim">
              {detail.description}
            </p>
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
      </div>

      {/* headline stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total value locked">
          {detail.currentTvl !== null ? compactUsd(detail.currentTvl) : "–"}
        </Stat>
        <Stat
          label="Volume 24h"
          secondary={
            volume?.change1d !== null && volume?.change1d !== undefined ? (
              <span className={cn(volume.change1d >= 0 ? "text-ok" : "text-fail")}>
                {volume.change1d >= 0 ? "+" : ""}
                {volume.change1d.toFixed(1)}% vs yesterday
              </span>
            ) : undefined
          }
        >
          {volume?.total24h != null ? compactUsd(volume.total24h) : "–"}
        </Stat>
        <Stat label="Volume 7d">
          {volume?.total7d != null ? compactUsd(volume.total7d) : "–"}
        </Stat>
        <Stat label="Volume 30d">
          {volume?.total30d != null ? compactUsd(volume.total30d) : "–"}
        </Stat>
      </div>

      {/* TVL history */}
      <Card className="tile gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Total value locked</h2>
          <span className="text-xs uppercase tracking-wider text-dim">
            last {detail.tvlHistory.length} days
          </span>
        </div>
        {detail.tvlHistory.length > 1 ? (
          <TvlChart points={detail.tvlHistory} />
        ) : (
          <EmptyState message="Couldn't reach DefiLlama. TVL history will be back on the next refresh." />
        )}
      </Card>

      {/* daily volume */}
      <Card className="tile gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Daily volume</h2>
          {volume && (
            <span className="text-xs uppercase tracking-wider text-dim">
              last {volume.chart.length} days
            </span>
          )}
        </div>
        {volume ? (
          <VolumeChart points={volume.chart} />
        ) : (
          <EmptyState
            message={
              detail.kind === "Lending"
                ? `${detail.name} is a lending protocol, so there's no trading volume to chart. TVL above is the meaningful number.`
                : "No volume feed for this protocol yet."
            }
          />
        )}
      </Card>

      {/* on-chain activity */}
      <Card className="gap-3 p-5">
        <h2 className="text-base font-semibold">On-chain activity</h2>
        <EmptyState message="Live protocol activity needs each protocol's contract addresses plus a mainnet RPC endpoint, and full history needs an indexer. Both are on the roadmap; the charts above come straight from public data today." />
      </Card>
    </div>
  );
}

function Stat({
  label,
  children,
  secondary,
}: {
  label: string;
  children: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="tile flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <span className="text-xs uppercase tracking-wider text-dim">{label}</span>
      <span className="font-mono text-2xl font-semibold">{children}</span>
      {secondary && <span className="font-mono text-xs">{secondary}</span>}
    </div>
  );
}
