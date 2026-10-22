import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/EmptyState";
import { TvlChart } from "./TvlChart";
import { TokenIcon } from "./TokenIcon";
import { ProtocolIcon } from "./ProtocolIcon";
import { Sparkline } from "./Sparkline";
import { getChainTvlWithBreakdown, getProtocols } from "@/lib/stellar/defi";
import { getTopTokens } from "@/lib/stellar/assets";
import { assetHref } from "@/lib/stellar/assetId";
import { compactNumber, compactUsd, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function DefiSection() {
  const [{ points: history, breakdown }, protocols, tokens] = await Promise.all([
    getChainTvlWithBreakdown(),
    getProtocols(),
    getTopTokens(),
  ]);

  const currentTvl = history?.[history.length - 1]?.tvl ?? null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">DeFi on Stellar</h2>
        <Badge variant="outline" className="text-dim">
          mainnet
        </Badge>
        <span className="ml-auto text-xs text-dim">
          data: DefiLlama · Astrolabe
        </span>
      </div>

      <Card className="tile gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <h3 className="text-base font-semibold">Total value locked</h3>
            {currentTvl && (
              <span className="text-2xl font-semibold tabular-nums tracking-tight">
                {compactUsd(currentTvl)}
              </span>
            )}
          </div>
          <span className="text-xs uppercase tracking-wider text-dim">
            last 90 days
          </span>
        </div>
        {history ? (
          <TvlChart points={history} breakdown={breakdown} />
        ) : (
          <EmptyState message="Couldn't reach DefiLlama. TVL data will be back on the next refresh." />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="tile gap-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold">Top tokens</h3>
            <span className="text-xs uppercase tracking-wider text-dim">
              most used, last 7 days
            </span>
          </div>
          {!tokens?.length ? (
            <EmptyState message="Couldn't load token activity from the indexer. It will be back on the next refresh." />
          ) : (
            <div className="flex flex-col">
              <div className="grid grid-cols-[minmax(0,1fr)_5rem_4.5rem_5.5rem] items-center gap-x-3 border-b border-border pb-2 text-xs font-medium uppercase tracking-wider text-dim sm:grid-cols-[minmax(0,1fr)_5rem_4rem_4.5rem_5.5rem]">
                <span>Token</span>
                <span className="text-right">Price</span>
                <span className="hidden text-right sm:block">7d</span>
                <span
                  className="text-right"
                  title="Distinct accounts that sent the token in the last 7 days"
                >
                  Senders
                </span>
                <span className="text-right">Holders</span>
              </div>
              {tokens.map((t) => (
                <div
                  key={`${t.identity.code}-${t.identity.issuer}`}
                  className="grid h-[46px] grid-cols-[minmax(0,1fr)_5rem_4.5rem_5.5rem] items-center gap-x-3 border-b border-border last:border-b-0 sm:grid-cols-[minmax(0,1fr)_5rem_4rem_4.5rem_5.5rem]"
                >
                  <Link
                    href={assetHref(t.identity)}
                    className="group flex min-w-0 items-center gap-2.5 rounded-sm"
                  >
                    <TokenIcon image={t.image} issuer={t.identity.issuer} code={t.identity.code} />
                    <span className="min-w-0">
                      <span className="block max-w-[16ch] truncate font-mono text-sm leading-tight decoration-dotted underline-offset-4 group-hover:underline">
                        {t.identity.code}
                      </span>
                      <span className="block truncate text-xs leading-tight text-dim">
                        {t.org}
                      </span>
                    </span>
                  </Link>
                  <span className="text-right font-mono text-sm">
                    {t.priceUsd !== null ? formatPrice(t.priceUsd) : "–"}
                  </span>
                  <span
                    className="hidden justify-end sm:flex"
                    title="Senders per day, last 7 days"
                  >
                    <Sparkline values={t.dailySenders} />
                  </span>
                  <span className="text-right font-mono text-sm text-dim">
                    {compactNumber(t.senders)}
                  </span>
                  <span className="text-right font-mono text-sm text-dim">
                    {compactNumber(t.holders)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="tile gap-3 p-5">
          <h3 className="text-base font-semibold">Top protocols</h3>
          {protocols.length === 0 ? (
            <EmptyState message="Couldn't reach DefiLlama. Protocol data will be back on the next refresh." />
          ) : (
            <div className="flex flex-col">
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-x-3 border-b border-border pb-2 text-xs font-medium uppercase tracking-wider text-dim">
                <span>Protocol</span>
                <span className="text-right">TVL</span>
                <span className="text-right">Vol 24h</span>
              </div>
              {protocols.map((p) => (
                <div
                  key={p.name}
                  className="grid h-[46px] grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-x-3 border-b border-border last:border-b-0"
                >
                  <Link
                    href={`/defi/${p.slug}`}
                    className="group flex min-w-0 items-center gap-2.5 rounded-sm"
                  >
                    <ProtocolIcon logo={p.logo} name={p.name} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm leading-tight group-hover:underline underline-offset-4 decoration-dotted">
                        {p.name}
                      </span>
                      <span className="block text-xs leading-tight text-dim">
                        {p.kind}
                      </span>
                    </span>
                  </Link>
                  <span className="text-right font-mono text-sm">
                    {p.tvl !== null ? compactUsd(p.tvl) : "–"}
                  </span>
                  <span className="text-right font-mono text-sm text-dim">
                    {p.volume24h !== null && p.volume24h > 0
                      ? compactUsd(p.volume24h)
                      : "–"}
                    {p.change1d !== null && p.volume24h ? (
                      <span
                        className={cn(
                          "block text-[11px] leading-tight",
                          p.change1d >= 0 ? "text-ok" : "text-fail",
                        )}
                      >
                        {p.change1d >= 0 ? "+" : ""}
                        {p.change1d.toFixed(1)}%
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
