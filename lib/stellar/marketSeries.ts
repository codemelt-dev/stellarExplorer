import type { ChPairHour } from "./indexer/market";

// a pair's hourly fills as the asset page charts them: every hour of the
// window, quiet ones carrying the last price. Pure and client-safe

const UNITS = 10_000_000;
const HOUR = 3600;

export interface MarketHour {
  /** Unix seconds, start of the UTC hour. */
  t: number;
  trades: number;
  /** In units, both sides. */
  baseVolume: number;
  counterVolume: number;
  /**
   * Counter per base: the hour's volume-weighted average, or the last one
   * carried through an hour without fills. Weighted so a dust fill at a silly
   * price can't swing the line.
   */
  price: number;
  /** The hour's own fills, null without any. */
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}

/** Every hour from the first fill in the window up to the current one, oldest first. */
export function toMarketHours(rows: ChPairHour[], nowS: number): MarketHour[] {
  const byHour = new Map(rows.map((r) => [Number(r.hour), r]));
  const first = Math.min(...byHour.keys());
  if (!Number.isFinite(first)) return [];
  const last = Math.floor(nowS / HOUR) * HOUR;
  const hours: MarketHour[] = [];
  let price = 0;
  for (let t = first; t <= last; t += HOUR) {
    const r = byHour.get(t);
    if (!r) {
      hours.push({ t, trades: 0, baseVolume: 0, counterVolume: 0, price, open: null, high: null, low: null, close: null });
      continue;
    }
    const baseVolume = Number(r.base_volume) / UNITS;
    const counterVolume = Number(r.counter_volume) / UNITS;
    price = baseVolume > 0 ? counterVolume / baseVolume : Number(r.close);
    hours.push({
      t,
      trades: Number(r.trades),
      baseVolume,
      counterVolume,
      price,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    });
  }
  return hours;
}

export interface MarketDay {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  trades: number;
  baseVolume: number;
  counterVolume: number;
  /** Volume-weighted over the day, null without fills. */
  price: number | null;
  high: number | null;
  low: number | null;
}

/** The hours added up per UTC day, oldest first. */
export function dailyRollup(hours: MarketHour[]): MarketDay[] {
  const days = new Map<string, MarketDay>();
  for (const h of hours) {
    const day = new Date(h.t * 1000).toISOString().slice(0, 10);
    const d = days.get(day) ?? { day, trades: 0, baseVolume: 0, counterVolume: 0, price: null, high: null, low: null };
    d.trades += h.trades;
    d.baseVolume += h.baseVolume;
    d.counterVolume += h.counterVolume;
    if (h.high !== null) d.high = Math.max(d.high ?? h.high, h.high);
    if (h.low !== null) d.low = Math.min(d.low ?? h.low, h.low);
    days.set(day, d);
  }
  return [...days.values()].map((d) => ({ ...d, price: d.baseVolume > 0 ? d.counterVolume / d.baseVolume : null }));
}

/** Change from the window's first price to its last, as a fraction. Null with under two hours. */
export function priceChange(hours: MarketHour[]): number | null {
  if (hours.length < 2 || !(hours[0].price > 0)) return null;
  return hours[hours.length - 1].price / hours[0].price - 1;
}
