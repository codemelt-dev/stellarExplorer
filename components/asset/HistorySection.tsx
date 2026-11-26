"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyBars, dayLabel } from "@/components/analytics/DailyBars";
import { DailyLine } from "@/components/analytics/DailyLine";
import { Segmented } from "@/components/layout/Segmented";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { compactNumber } from "@/lib/format";
import { historySeries, type AssetHistory, type Counter } from "@/lib/stellar/assetSeries";

const RANGES = [
  { id: "30", label: "30D" },
  { id: "all", label: "All" },
];

type Load = { state: "loading" } | { state: "failed" } | { state: "ready"; history: AssetHistory };

// holders, supply and DEX volume per day, mainnet only. Read after the page
// renders, like the market: days of trades are a heavy read
export function HistorySection({
  assetId,
  code,
  decimals,
  countsSupply = true,
}: {
  /** The asset page's id, or a Soroban token's contract id. */
  assetId: string;
  code: string;
  decimals: number;
  /** False when the index misses some of a token's transfers and its supply can't be counted. */
  countsSupply?: boolean;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const fetchHistory = useCallback(
    (signal?: AbortSignal) =>
      fetch(`/api/assets/${encodeURIComponent(assetId)}/history`, { signal })
        .then((res) => (res.ok ? (res.json() as Promise<AssetHistory>) : Promise.reject(new Error(String(res.status)))))
        .then((history) => setLoad({ state: "ready", history }))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) setLoad({ state: "failed" });
        }),
    [assetId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchHistory(controller.signal);
    return () => controller.abort();
  }, [fetchHistory]);

  return (
    <Card className="gap-5 p-5" aria-busy={load.state === "loading"}>
      {load.state === "failed" ? (
        <>
          <Heading />
          <ErrorState
            message="Couldn't load this asset's history from the indexer."
            onRetry={() => {
              setLoad({ state: "loading" });
              fetchHistory();
            }}
          />
        </>
      ) : load.state === "loading" ? (
        <>
          <Heading />
          <div className="grid gap-5 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-[150px] w-full" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <HistoryBody history={load.history} code={code} decimals={decimals} countsSupply={countsSupply} />
      )}
    </Card>
  );
}

function Heading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">History</h2>
        <p className="text-sm text-dim">Daily, from our own index. Holders and supply since 8 October 2026.</p>
      </div>
      {children}
    </div>
  );
}

function HistoryBody({
  history,
  code,
  decimals,
  countsSupply,
}: {
  history: AssetHistory;
  code: string;
  decimals: number;
  countsSupply: boolean;
}) {
  const [range, setRange] = useState("30");
  const [picked, setPicked] = useState<Counter | null>(null);
  const series = historySeries(history, decimals);
  const from = range === "all" ? 0 : Math.max(0, series.days.length - Number(range));
  const days = series.days.slice(from);
  const holders = series.holders.slice(from);
  const supply = series.supply.slice(from);
  const notes = series.carried.slice(from).map((d) => (d ? `no snapshot, as of ${dayLabel(d)}` : null));
  const counter = picked ?? history.counters[0];
  const volume = counter ? (series.volume[counter] ?? []).slice(from) : [];

  const count = (values: Array<number | null>) => values.filter((v) => v !== null).length;
  const latest = (values: Array<number | null>) => values.findLast((v) => v !== null) ?? null;
  const units = (n: number) => `${compactNumber(n)} ${code}`;
  const traded = volume.reduce<number>((s, v) => s + (v ?? 0), 0);
  const tooFew = "Fewer than two days of data in this range so far.";

  return (
    <>
      <Heading>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {days.length > 0 && (
            <span className="text-xs text-dim">
              {dayLabel(days[0])} to {dayLabel(days[days.length - 1])}
              {/* a range longer than the index shows everything there is, say so */}
              {range !== "all" && days.length < Number(range) && `, the ${days.length} days indexed so far`}
            </span>
          )}
          <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
        </div>
      </Heading>
      <div className="grid gap-5 lg:grid-cols-3">
        <Chart
          title="Holders"
          figure={latest(holders)?.toLocaleString("en-US")}
          info="Accounts and contracts with a positive balance at the end of the day."
        >
          {count(holders) < 2 ? (
            <EmptyState message={tooFew} />
          ) : (
            <DailyLine days={days} values={holders} notes={notes} format={(n) => n.toLocaleString("en-US")} label="Holders" />
          )}
        </Chart>

        <Chart
          title="Supply"
          figure={countsSupply && latest(supply) !== null ? units(latest(supply)!) : undefined}
          info="Everything in circulation at the end of the day, in accounts, pools, contracts and unclaimed balances."
        >
          {!countsSupply ? (
            <EmptyState message="Our index is missing some of this token's transfers, so its supply isn't counted." />
          ) : count(supply) < 2 ? (
            <EmptyState message={tooFew} />
          ) : (
            <DailyLine days={days} values={supply} notes={notes} format={units} label={`Supply in ${code}`} />
          )}
        </Chart>

        <Chart
          title="Volume"
          figure={counter && count(volume) > 0 ? `${compactNumber(traded)} ${counter} total` : undefined}
          info={
            counter
              ? `Trades against ${counter} on the Stellar DEX, order book and pools, in ${counter}.`
              : "Trades on the Stellar DEX, order book and pools."
          }
          action={
            history.counters.length > 1 && counter ? (
              <Segmented
                label="Traded against"
                options={history.counters.map((c) => ({ id: c, label: c }))}
                value={counter}
                onChange={(c) => setPicked(c as Counter)}
              />
            ) : undefined
          }
        >
          {!counter ? (
            <EmptyState message={`The Stellar DEX trades classic assets only, so ${code} has no volume there.`} />
          ) : count(volume) < 2 ? (
            <EmptyState message={tooFew} />
          ) : traded === 0 ? (
            <EmptyState message={`No ${code} trades against ${counter} in this range.`} />
          ) : (
            <DailyBars
              days={days}
              series={[{ label: `Against ${counter}`, color: "var(--gold)" }]}
              values={volume.map((v) => [v])}
              format={(n) => `${compactNumber(n)} ${counter}`}
              label={`Volume against ${counter}`}
            />
          )}
        </Chart>
      </div>
    </>
  );
}

function Chart({
  title,
  figure,
  info,
  action,
  children,
}: {
  title: string;
  /** The latest day, or the range's total for volume. */
  figure?: string;
  info: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
        {figure && <span className="font-mono text-sm text-dim">{figure}</span>}
      </div>
      {children}
      <p className="text-xs text-dim">{info}</p>
    </div>
  );
}
