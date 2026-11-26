"use client";

import { useRef, useState } from "react";
import { dayLabel } from "./DailyBars";

const W = 800;
const H = 150;
// room above and below the line for the highest and lowest labels
const PAD_Y = 20;

// a daily level as a line between its lowest and highest day, broken where a
// day has no data; hover a day for its number. Same frame as DailyBars
export function DailyLine({
  days,
  values,
  format,
  label,
  notes,
  color = "var(--gold)",
}: {
  days: string[];
  /** Per day, null for a day without data. */
  values: Array<number | null>;
  format: (n: number) => string;
  /** What the chart shows, for screen readers. */
  label: string;
  /** Per day, a line under its number in the tooltip. */
  notes?: Array<string | null>;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const known = values.filter((v): v is number => v !== null);
  const max = Math.max(...known);
  const min = Math.min(...known);
  const x = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * W : W / 2);
  // a flat line sits in the middle
  const y = (v: number) => (max === min ? H / 2 : H - PAD_Y - ((v - min) / (max - min)) * (H - PAD_Y * 2));

  // one stretch per run of days with data
  const runs: Array<Array<[number, number]>> = [[]];
  values.forEach((v, i) => {
    if (v !== null) runs[runs.length - 1].push([x(i), y(v)]);
    else if (runs[runs.length - 1].length) runs.push([]);
  });
  const path = (run: Array<[number, number]>) => run.map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const latest = values.findLast((v) => v !== null);

  function onMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  }

  const h = hover === null ? null : values[hover];

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
        aria-label={`${label} per day over ${days.length} days${latest == null ? "" : `, latest ${format(latest)}`}`}
      >
        {runs
          .filter((run) => run.length > 1)
          .map((run) => (
            <g key={run[0][0]}>
              <path d={`${path(run)}L${run[run.length - 1][0]},${H}L${run[0][0]},${H}Z`} fill={color} fillOpacity="0.08" />
              <path d={path(run)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1="0"
            y2={H}
            stroke="var(--line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* points as html, so they stay round on a stretched chart: a lone day, and the one hovered */}
      {runs
        .filter((run) => run.length === 1)
        .map(([[px, py]]) => (
          <Dot key={px} left={px} top={py} color={color} />
        ))}
      {hover !== null && h !== null && <Dot left={x(hover)} top={y(h)} color={color} />}

      {known.length > 0 && max !== min && (
        <>
          <span className="pointer-events-none absolute top-0 left-0 font-mono text-[10px] leading-none text-dim">{format(max)}</span>
          <span className="pointer-events-none absolute bottom-0 left-0 font-mono text-[10px] leading-none text-dim">{format(min)}</span>
        </>
      )}

      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-1 z-10 rounded-md border border-border bg-surface-2/95 px-2.5 py-1.5 text-xs whitespace-nowrap backdrop-blur-sm"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(-${(x(hover) / W) * 100}%)`,
          }}
        >
          <div className="font-mono text-dim">{dayLabel(days[hover])}</div>
          {h === null ? <div className="text-dim">no data</div> : <div className="font-mono">{format(h)}</div>}
          {notes?.[hover] && <div className="text-dim">{notes[hover]}</div>}
        </div>
      )}
    </div>
  );
}

function Dot({ left, top, color }: { left: number; top: number; color: string }) {
  return (
    <span
      className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ left: `${(left / W) * 100}%`, top: `${(top / H) * 100}%`, background: color }}
      aria-hidden="true"
    />
  );
}
