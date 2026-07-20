"use client";

import { useRef, useState } from "react";
import { compactUsd } from "@/lib/format";
import type { TvlBreakdownRow, TvlPoint } from "@/lib/stellar/defi";

const W = 800;
const H = 140;
const PAD_Y = 10;

// 90-day chain TVL area chart, same grammar as the tx chart. With breakdown
// data the tooltip becomes a per-protocol panel instead of a one-line pill
export function TvlChart({
  points,
  breakdown,
}: {
  points: TvlPoint[];
  breakdown?: Record<number, TvlBreakdownRow[]>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const max = Math.max(...points.map((p) => p.tvl));
  const min = Math.min(...points.map((p) => p.tvl));
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) =>
    H - PAD_Y - ((v - min) / range) * (H - PAD_Y * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.tvl).toFixed(1)}`)
    .join("");
  const areaPath = `${linePath}L${W},${H}L0,${H}Z`;

  function onMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const i = Math.round(ratio * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const h = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[140px] w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Stellar DeFi total value locked over the last ${points.length} days, currently ${compactUsd(points[points.length - 1].tvl)}`}
      >
        <defs>
          <linearGradient id="tvl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.5].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H - PAD_Y - f * (H - PAD_Y * 2)}
            y2={H - PAD_Y - f * (H - PAD_Y * 2)}
            stroke="var(--line)"
            strokeOpacity="0.5"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={areaPath} fill="url(#tvl-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD_Y / 2}
              y2={H}
              stroke="var(--text-dim)"
              strokeOpacity="0.5"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(hover)} cy={y(points[hover].tvl)} r="3.5" fill="var(--gold)" />
          </>
        )}
      </svg>

      {h &&
        (() => {
          const rows = breakdown?.[Math.floor(h.date / 86400)];
          const rawPct = (hover! / (points.length - 1)) * 100;
          if (!rows?.length) {
            const pct = Math.min(88, Math.max(12, rawPct));
            return (
              <div
                className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-md border border-border bg-surface-2/95 px-2.5 py-1.5 font-mono text-xs whitespace-nowrap backdrop-blur-sm"
                style={{ left: `${pct}%` }}
              >
                {new Date(h.date * 1000).toISOString().slice(0, 10)}
                <span className="text-dim"> · </span>
                {compactUsd(h.tvl)}
              </div>
            );
          }
          // panel sits beside the crosshair, never on top of it
          const onLeft = rawPct > 50;
          return (
            <div
              className={`pointer-events-none absolute top-1/2 z-10 w-52 -translate-y-1/2 rounded-lg border border-border bg-surface-2/95 p-2.5 backdrop-blur-md ${onLeft ? "-translate-x-full" : ""}`}
              style={{
                left: `calc(${rawPct}% ${onLeft ? "- 14px" : "+ 14px"})`,
              }}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2 border-b border-border pb-1 text-[11px]">
                <span className="font-mono text-dim">
                  {new Date(h.date * 1000).toISOString().slice(0, 10)}
                </span>
                <span className="font-mono">{compactUsd(h.tvl)}</span>
              </div>
              <div className="flex flex-col gap-[3px] pt-0.5">
                {rows.map((row) => (
                  <div
                    key={row.slug}
                    className="flex items-center justify-between gap-2 text-[11px] leading-4"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.logo}
                        alt=""
                        width={10}
                        height={10}
                        className="size-2.5 shrink-0 rounded-full"
                        loading="lazy"
                      />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="shrink-0 font-mono">
                      {compactUsd(row.tvl)}
                      <span className="text-dim">
                        {" "}
                        {((row.tvl / h.tvl) * 100).toFixed(1)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
