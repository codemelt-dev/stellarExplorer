"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/defi/Sparkline";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { compactNumber } from "@/lib/format";
import type { AssetMarket } from "@/lib/stellar/assetMarket";
import { dailyRollup, priceChange } from "@/lib/stellar/marketSeries";
import { MarketCharts, formatQuote } from "./MarketCharts";

const UNITS = 10_000_000;

type Load = { state: "loading" } | { state: "failed" } | { state: "ready"; market: AssetMarket };

// the asset's last week on the DEX and what sits in open offers. Read after
// the page renders: a week of trades is a heavy read, and crawlers don't run
// scripts, so only people set it off
export function MarketSection({ assetId, code, mainnet }: { assetId: string; code: string; mainnet: boolean }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const fetchMarket = useCallback(
    (signal?: AbortSignal) =>
      fetch(`/api/assets/${encodeURIComponent(assetId)}/market`, { signal })
        .then((res) => (res.ok ? (res.json() as Promise<AssetMarket>) : Promise.reject(new Error(String(res.status)))))
        .then((market) => setLoad({ state: "ready", market }))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) setLoad({ state: "failed" });
        }),
    [assetId],
  );

  useEffect(() => {
    if (!mainnet) return;
    const controller = new AbortController();
    fetchMarket(controller.signal);
    return () => controller.abort();
  }, [mainnet, fetchMarket]);

  return (
    <Card className="gap-5 p-5" aria-busy={mainnet && load.state === "loading"}>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Market</h2>
        <p className="text-sm text-dim">
          {code === "XLM" ? "XLM against Circle USDC" : `${code} against XLM`} on the Stellar DEX, order book and pools,
          hour by hour over the last 7 days.
        </p>
      </div>
      {!mainnet ? (
        <EmptyState message="Market data comes from the indexer, which covers mainnet only. Switch to Mainnet in the top bar to see it." />
      ) : load.state === "loading" ? (
        <MarketSkeleton />
      ) : load.state === "failed" ? (
        <ErrorState
          message="Couldn't load this week's trades from the indexer."
          onRetry={() => {
            setLoad({ state: "loading" });
            fetchMarket();
          }}
        />
      ) : (
        <MarketBody market={load.market} code={code} />
      )}
    </Card>
  );
}

function MarketBody({ market, code }: { market: AssetMarket; code: string }) {
  const { hours, counter, onOffers } = market;
  const traded = hours.some((h) => h.trades > 0);
  const change = priceChange(hours);
  const volume = hours.reduce((sum, h) => sum + h.counterVolume, 0);
  const trades = hours.reduce((sum, h) => sum + h.trades, 0);
  const offered = onOffers.today === null ? null : Number(onOffers.today) / UNITS;
  const supply = onOffers.supply === null ? 0 : Number(onOffers.supply) / UNITS;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure
          label={`Price in ${counter}`}
          value={traded ? formatQuote(hours[hours.length - 1].price) : "–"}
          caption={change === null ? "no trades this week" : `${change >= 0 ? "+" : "-"}${Math.abs(change * 100).toFixed(1)}% over 7 days`}
        />
        <Figure
          label="Volume, 7 days"
          value={traded ? `${compactNumber(volume)} ${counter}` : "–"}
          caption={`${trades.toLocaleString("en-US")} trade${trades === 1 ? "" : "s"}`}
        />
        <Figure
          label="On open offers"
          value={offered === null ? "–" : `${compactNumber(offered)} ${code}`}
          caption={
            offered === null
              ? "not indexed"
              : supply > 0
                ? `${((offered / supply) * 100).toFixed(2)}% of the supply, updated daily`
                : "updated daily"
          }
          trend={onOffers.days.map((d) => Number(d.amount))}
        />
      </div>

      {traded ? (
        <>
          <MarketCharts hours={hours} code={code} counter={counter} />
          <DailyTable hours={hours} counter={counter} />
        </>
      ) : (
        <EmptyState message={`No trades of ${code} against ${counter} in the last 7 days.`} />
      )}
    </>
  );
}

function Figure({ label, value, caption, trend }: { label: string; value: string; caption: string; trend?: number[] }) {
  return (
    <div className="flex min-w-0 items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-dim">{label}</span>
        <span className="truncate text-xl font-semibold tracking-tight">{value}</span>
        <span className="truncate text-xs text-dim">{caption}</span>
      </div>
      {trend && trend.length > 1 && (
        <span className="mb-1 shrink-0" title="Each day since 11 November 2026">
          <Sparkline values={trend} />
        </span>
      )}
    </div>
  );
}

function DailyTable({ hours, counter }: { hours: AssetMarket["hours"]; counter: string }) {
  const days = dailyRollup(hours).reverse();
  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium">Daily numbers</summary>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full text-sm">
          <thead className="bg-table-head text-xs uppercase tracking-wider text-dim">
            <tr className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-right [&_th]:font-medium [&_th]:whitespace-nowrap">
              <th className="!text-left">Day</th>
              <th>Average, {counter}</th>
              <th>Low</th>
              <th>High</th>
              <th>Volume, {counter}</th>
              <th>Trades</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {days.map((d) => (
              <tr key={d.day} className="border-t border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-right [&_td]:whitespace-nowrap">
                <td className="!text-left text-dim">{d.day}</td>
                <td>{d.price === null ? "–" : formatQuote(d.price)}</td>
                <td>{d.low === null ? "–" : formatQuote(d.low)}</td>
                <td>{d.high === null ? "–" : formatQuote(d.high)}</td>
                <td>{Math.round(d.counterVolume).toLocaleString("en-US")}</td>
                <td>{d.trades.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function MarketSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[140px] w-full" />
      <Skeleton className="h-11 w-full" />
    </>
  );
}
