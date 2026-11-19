import { StellarMark } from "@/components/stellar/StellarMark";
import { compactUsd } from "@/lib/format";
import type { TvlBreakdownRow } from "@/lib/stellar/defi";

// one day split by protocol, beside the crosshair, never on top of it
export function BreakdownPanel({
  date,
  total,
  rows,
  at,
}: {
  /** Unix seconds. */
  date: number;
  total: number;
  rows: TvlBreakdownRow[];
  /** How far across the chart the day is, in percent. */
  at: number;
}) {
  const onLeft = at > 50;
  return (
    <div
      className={`pointer-events-none absolute top-1/2 z-10 w-52 -translate-y-1/2 rounded-lg border border-border bg-surface-2/95 p-2.5 backdrop-blur-md ${onLeft ? "-translate-x-full" : ""}`}
      style={{
        left: `calc(${at}% ${onLeft ? "- 14px" : "+ 14px"})`,
      }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2 border-b border-border pb-1 text-[11px]">
        <span className="font-mono text-dim">{new Date(date * 1000).toISOString().slice(0, 10)}</span>
        <span className="font-mono">{compactUsd(total)}</span>
      </div>
      <div className="flex flex-col gap-[3px] pt-0.5">
        {rows.map((row) => (
          <div key={row.slug} className="flex items-center justify-between gap-2 text-[11px] leading-4">
            <span className="flex min-w-0 items-center gap-1.5">
              {row.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.logo}
                  alt=""
                  width={10}
                  height={10}
                  className="size-2.5 shrink-0 rounded-full"
                  loading="lazy"
                />
              ) : (
                <StellarMark className="size-2.5 shrink-0" />
              )}
              <span className="truncate">{row.name}</span>
            </span>
            <span className="shrink-0 font-mono">
              {compactUsd(row.tvl)}
              <span className="text-dim"> {total > 0 ? ((row.tvl / total) * 100).toFixed(1) : "0.0"}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
