"use client";

import { useState } from "react";
import { TvlChart } from "./TvlChart";
import { VolumeChart } from "./VolumeChart";
import { EmptyState } from "@/components/states/EmptyState";
import type { TvlPoint } from "@/lib/stellar/defi";
import { cn } from "@/lib/utils";

type Metric = "tvl" | "volume";
const RANGES = [7, 30, 90] as const;

// one chart card for a protocol: TVL or daily volume, over 7/30/90 days
export function ProtocolCharts({
  tvl,
  volume,
  noVolumeMessage,
}: {
  tvl: TvlPoint[];
  volume: Array<{ date: number; volume: number }> | null;
  noVolumeMessage: string;
}) {
  const [metric, setMetric] = useState<Metric>(volume ? "volume" : "tvl");
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);

  const tvlPoints = tvl.slice(-days);
  const volumePoints = volume?.slice(-days) ?? [];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {metric === "tvl" ? "Total value locked" : "Daily volume"}
        </h2>
        <div className="flex items-center gap-2">
          <Segmented
            label="Metric"
            options={[
              { id: "volume", label: "Volume" },
              { id: "tvl", label: "TVL" },
            ]}
            value={metric}
            onChange={(v) => setMetric(v as Metric)}
          />
          <Segmented
            label="Range"
            options={RANGES.map((d) => ({ id: String(d), label: `${d}D` }))}
            value={String(days)}
            onChange={(v) => setDays(Number(v) as (typeof RANGES)[number])}
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center">
        {metric === "tvl" ? (
          tvlPoints.length > 1 ? (
            <TvlChart points={tvlPoints} />
          ) : (
            <EmptyState message="Couldn't reach DefiLlama. TVL history will be back on the next refresh." />
          )
        ) : volumePoints.length > 0 ? (
          <VolumeChart points={volumePoints} />
        ) : (
          <EmptyState message={noVolumeMessage} />
        )}
      </div>
    </div>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded px-2 py-0.5 text-xs transition-colors duration-150",
            o.id === value ? "bg-surface-2 text-foreground" : "text-dim hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
