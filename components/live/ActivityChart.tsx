"use client";

import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLedgerStream } from "./LedgerStreamProvider";
import { Time } from "@/components/stellar/Time";
import Link from "next/link";

const W = 800;
const H = 150;
const PAD_Y = 12;

// live tx-per-ledger area chart. One series, gold, crosshair tooltip
export function ActivityChart() {
  const { ledgers } = useLedgerStream();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // oldest -> newest, left to right
  const data = useMemo(
    () =>
      [...ledgers]
        .sort((a, b) => a.sequence - b.sequence)
        .map((l) => ({ ...l, total: l.txOk + l.txFailed })),
    [ledgers],
  );

  if (data.length < 2) {
    return (
      <Card className="gap-3 p-5">
        <h2 className="text-base font-semibold">Transactions per ledger</h2>
        <Skeleton className="h-[150px] w-full" />
      </Card>
    );
  }

  const max = Math.max(...data.map((d) => d.total), 1);
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => H - PAD_Y - (v / max) * (H - PAD_Y * 2);

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`)
    .join("");
  const areaPath = `${linePath}L${W},${H}L0,${H}Z`;

  function onMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const i = Math.round(ratio * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  const h = hover !== null ? data[hover] : null;

  return (
    <Card className="tile gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Transactions per ledger</h2>
        <span className="text-xs uppercase tracking-wider text-dim">
          last {data.length} ledgers
        </span>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-[150px] w-full"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`Transactions per ledger over the last ${data.length} ledgers, currently ${data[data.length - 1].total}`}
        >
          <defs>
            <linearGradient id="tx-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* recessive grid */}
          {[0.25, 0.5, 0.75].map((f) => (
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

          {/* d as a CSS property so new points glide instead of jumping
              (browsers without CSS d support fall back to the attribute) */}
          <path
            d={areaPath}
            fill="url(#tx-fill)"
            style={{ d: `path("${areaPath}")`, transition: "d 400ms ease" }}
          />
          <path
            d={linePath}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ d: `path("${linePath}")`, transition: "d 400ms ease" }}
          />

          {/* latest point */}
          <circle
            cx={x(data.length - 1)}
            cy={y(data[data.length - 1].total)}
            r="3"
            fill="var(--gold)"
            style={{ transition: "cx 400ms ease, cy 400ms ease" }}
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
              <circle cx={x(hover)} cy={y(data[hover].total)} r="3.5" fill="var(--gold)" />
            </>
          )}
        </svg>

        {h && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-md border border-border bg-surface-2/95 px-2.5 py-1.5 font-mono text-xs whitespace-nowrap backdrop-blur-sm"
            style={{
              left: `${Math.min(88, Math.max(12, (hover! / (data.length - 1)) * 100))}%`,
            }}
          >
            <span className="text-dim">#</span>
            {h.sequence.toLocaleString("en-US")}
            <span className="text-dim"> · </span>
            {h.total} tx
            {h.txFailed > 0 && <span className="text-fail"> ({h.txFailed} failed)</span>}
          </div>
        )}
      </div>

      <div className="flex justify-between font-mono text-[11px] text-dim">
        <Link href={`/ledger/${data[0].sequence}`} className="hover:text-foreground">
          #{data[0].sequence.toLocaleString("en-US")}
        </Link>
        <span>
          peak {max} tx
        </span>
        <span className="inline-flex gap-2">
          <Time iso={data[data.length - 1].closedAt} />
        </span>
      </div>
    </Card>
  );
}
