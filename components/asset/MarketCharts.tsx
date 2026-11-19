"use client";

import { useState } from "react";
import { compactNumber } from "@/lib/format";
import type { MarketHour } from "@/lib/stellar/marketSeries";

const W = 800;
const PRICE_H = 140;
const VOLUME_H = 44;
const PAD_Y = 10;
const DAY = 86_400;

/** Prices from a few millionths up to thousands, 4 significant digits. */
export function formatQuote(n: number): string {
  return n >= 1000
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

const hourLabel = (t: number) =>
  new Date(t * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
const dayLabel = (t: number) =>
  new Date(t * 1000).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// the hourly price line over the hourly volume, one crosshair for both. Two
// charts, two scales: never one chart with two axes
export function MarketCharts({ hours, code, counter }: { hours: MarketHour[]; code: string; counter: string }) {
  const [at, setAt] = useState<number | null>(null);
  const last = hours.length - 1;

  const prices = hours.map((h) => h.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const range = hi - lo || hi || 1;
  const maxVolume = Math.max(...hours.map((h) => h.counterVolume)) || 1;
  const x = (i: number) => (last ? (i / last) * W : W / 2);
  const y = (p: number) => PRICE_H - PAD_Y - ((p - lo) / range) * (PRICE_H - PAD_Y * 2);
  const line = hours.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.price).toFixed(1)}`).join("");
  const area = `${line}L${W},${PRICE_H}L0,${PRICE_H}Z`;
  const slot = W / hours.length;
  const bar = Math.max(1, Math.min(24, slot - 2));
  const midnights = hours.flatMap((h, i) => (h.t % DAY === 0 ? [{ i, t: h.t }] : []));

  function pick(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const i = Math.round(((clientX - rect.left) / rect.width) * last);
    setAt(Math.max(0, Math.min(last, i)));
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowLeft" ? -1 : 1;
    setAt((i) => Math.max(0, Math.min(last, (i ?? last) + step)));
  }

  const h = at === null ? null : hours[at];
  const pct = at === null ? 0 : Math.min(85, Math.max(15, (x(at) / W) * 100));

  return (
    <div
      className="relative rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      tabIndex={0}
      role="group"
      aria-label={`${code} price in ${counter} and volume by hour. Arrow keys step through the hours.`}
      onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
      onPointerLeave={() => setAt(null)}
      onKeyDown={onKey}
      onBlur={() => setAt(null)}
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${PRICE_H}`}
          preserveAspectRatio="none"
          className="h-[140px] w-full"
          role="img"
          aria-label={`${code} in ${counter} by hour over ${hours.length} hours: from ${formatQuote(lo)} to ${formatQuote(hi)}, latest ${formatQuote(prices[last])}`}
        >
          <defs>
            <linearGradient id="market-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[PAD_Y, PRICE_H - PAD_Y].map((gy) => (
            <line key={gy} x1="0" x2={W} y1={gy} y2={gy} stroke="var(--line)" strokeOpacity="0.6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="url(#market-fill)" />
          <path d={line} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {at !== null && (
            <line x1={x(at)} x2={x(at)} y1="0" y2={PRICE_H} stroke="var(--text-dim)" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* the scale's two ends, in text ink */}
        <span className="pointer-events-none absolute top-0 right-0 -translate-y-1/2 bg-surface pl-1.5 font-mono text-[11px] text-dim tabular-nums">
          {formatQuote(hi)}
        </span>
        <span className="pointer-events-none absolute right-0 bottom-0 translate-y-1/2 bg-surface pl-1.5 font-mono text-[11px] text-dim tabular-nums">
          {formatQuote(lo)}
        </span>
        {at !== null && (
          <span
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-gold"
            style={{ left: `${(x(at) / W) * 100}%`, top: `${(y(hours[at].price) / PRICE_H) * 100}%` }}
          />
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${VOLUME_H}`} preserveAspectRatio="none" className="mt-3 h-11 w-full" aria-hidden="true">
        {hours.map((hr, i) =>
          hr.counterVolume > 0 ? (
            <rect
              key={hr.t}
              x={i * slot + (slot - bar) / 2}
              y={VOLUME_H - Math.max(1, (hr.counterVolume / maxVolume) * VOLUME_H)}
              width={bar}
              height={Math.max(1, (hr.counterVolume / maxVolume) * VOLUME_H)}
              fill={i === at ? "var(--gold)" : "var(--text-dim)"}
              fillOpacity={i === at ? 1 : 0.4}
            />
          ) : null,
        )}
      </svg>

      <div className="relative mt-1 h-4 text-[11px] text-dim">
        {midnights.map(({ i, t }) => (
          <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(i) / W) * 100}%` }}>
            {dayLabel(t)}
          </span>
        ))}
      </div>

      {h && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface-2/95 px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm backdrop-blur-sm"
          style={{ left: `${pct}%` }}
          role="status"
        >
          <div className="font-mono font-medium text-foreground tabular-nums">
            {formatQuote(h.price)} {counter}
          </div>
          <div className="text-dim">
            {hourLabel(h.t)} UTC
            {h.trades > 0
              ? ` · ${compactNumber(h.counterVolume)} ${counter} · ${h.trades.toLocaleString("en-US")} trade${h.trades === 1 ? "" : "s"}`
              : " · no trades"}
          </div>
          {h.low !== null && h.high !== null && (
            <div className="font-mono text-dim tabular-nums">
              low {formatQuote(h.low)} · high {formatQuote(h.high)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
