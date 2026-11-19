"use client";

import { useRef, useState } from "react";

const W = 800;
const H = 150;
const PAD_Y = 10;
// a sliver of surface between stacked segments
const GAP = 2;

export interface BarSeries {
  label: string;
  /** One of the meaning tokens, e.g. var(--gold) or var(--contract). */
  color: string;
}

export const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// daily bars, stacked when there's more than one series; hover a day for its numbers
export function DailyBars({
  days,
  series,
  values,
  format,
  label,
}: {
  days: string[];
  series: BarSeries[];
  /** Per day, one value per series; null for a day without data. */
  values: Array<Array<number | null>>;
  format: (n: number) => string;
  /** What the chart shows, for screen readers. */
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const totals = values.map((v) => v.reduce<number>((s, x) => s + (x ?? 0), 0));
  const scale = (H - PAD_Y * 2 - GAP * (series.length - 1)) / Math.max(...totals, 1);
  const step = W / days.length;
  const barW = Math.max(2, step * 0.7);
  const latest = totals.findLast((_, i) => values[i].some((v) => v !== null));

  // track the pointer anywhere over the chart, snap to the nearest day
  function onMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * days.length);
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  }

  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-[150px] w-full"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`${label} per day over the last ${days.length} days${latest === undefined ? "" : `, latest ${format(latest)}`}`}
        >
          <line
            x1="0"
            x2={W}
            y1={H / 2}
            y2={H / 2}
            stroke="var(--line)"
            strokeOpacity="0.5"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {values.map((vals, i) => {
            let bottom = H - PAD_Y;
            return vals.map((v, k) => {
              if (!v) return null;
              const height = Math.max(1, v * scale);
              bottom -= height;
              const rect = (
                <rect
                  key={`${days[i]}-${k}`}
                  x={i * step + (step - barW) / 2}
                  y={bottom}
                  width={barW}
                  height={height}
                  rx="1.5"
                  fill={series[k].color}
                  fillOpacity={hover === null || hover === i ? 0.85 : 0.35}
                />
              );
              bottom -= GAP;
              return rect;
            });
          })}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-1 z-10 min-w-36 -translate-x-1/2 rounded-md border border-border bg-surface-2/95 px-2.5 py-1.5 text-xs backdrop-blur-sm"
            style={{ left: `${Math.min(85, Math.max(15, ((hover + 0.5) / days.length) * 100))}%` }}
          >
            <div className="font-mono text-dim">{dayLabel(days[hover])}</div>
            {values[hover].every((v) => v === null) ? (
              <div className="text-dim">no data</div>
            ) : (
              <>
                {series.map((s, k) => (
                  <div key={s.label} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-dim">
                      <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                      {s.label}
                    </span>
                    <span className="font-mono">{values[hover][k] === null ? "–" : format(values[hover][k]!)}</span>
                  </div>
                ))}
                {series.length > 1 && (
                  <div className="mt-0.5 flex justify-between gap-3 border-t border-border pt-0.5">
                    <span className="text-dim">Total</span>
                    <span className="font-mono">{format(totals[hover])}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
