"use client";

import { useRef, useState } from "react";
import { compactNumber, compactUsd } from "@/lib/format";

const W = 800;
const H = 150;
const PAD_Y = 10;

// daily bars, hover tooltip per bar. Formats as money unless told otherwise
export function VolumeChart({
  points,
  unit = "usd",
}: {
  points: Array<{ date: number; volume: number }>;
  unit?: "usd" | "count";
}) {
  const format = unit === "usd" ? compactUsd : compactNumber;
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // track the pointer anywhere over the chart, snap to the nearest day
  function onMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const i = Math.floor(ratio * points.length);
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const max = Math.max(...points.map((p) => p.volume), 1);
  const step = W / points.length;
  const barW = Math.max(2, step * 0.7);

  const h = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[150px] w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Daily volume over the last ${points.length} days`}
      >
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
        {points.map((p, i) => {
          const barH = Math.max(1, (p.volume / max) * (H - PAD_Y * 2));
          return (
            <rect
              key={p.date}
              x={i * step + (step - barW) / 2}
              y={H - PAD_Y - barH}
              width={barW}
              height={barH}
              rx="1.5"
              fill="var(--gold)"
              fillOpacity={hover === null || hover === i ? 0.85 : 0.35}
            />
          );
        })}
      </svg>

      {h && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-md border border-border bg-surface-2/95 px-2.5 py-1.5 font-mono text-xs whitespace-nowrap backdrop-blur-sm"
          style={{
            left: `${Math.min(88, Math.max(12, ((hover! + 0.5) / points.length) * 100))}%`,
          }}
        >
          {new Date(h.date * 1000).toISOString().slice(0, 10)}
          <span className="text-dim"> · </span>
          {format(h.volume)}
        </div>
      )}
    </div>
  );
}
