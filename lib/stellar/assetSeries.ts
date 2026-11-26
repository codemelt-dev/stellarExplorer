import type { ChAssetSnapshot } from "./indexer/assets";
import type { ChDayFills } from "./indexer/market";

// an asset's daily history as the History section charts it. Pure and client-safe

/** What volume is counted against, both in 7 decimals. */
export type Counter = "XLM" | "USDC";
const COUNTER_UNITS = 10_000_000;
const DAY_MS = 86_400_000;

/** A day's fills of one asset per counter, the counter side in its base units. */
export type DayVolume = Partial<Record<Counter, { trades: number; volume: number }>>;

export interface AssetHistory {
  /** The counters this asset's volume is read against, none for a Soroban-only token. */
  counters: Counter[];
  snapshots: ChAssetSnapshot[];
  /** Each day of fills read, oldest first. A day the asset didn't trade has no counters. */
  volume: Array<{ day: string; counters: DayVolume }>;
}

/**
 * Every asset's volume against `counters` (asset key to name) out of a day's
 * fills. The counter side is the volume, whichever way a fill went, so a
 * fill between two counters counts for both.
 */
export function foldDayFills(rows: ChDayFills[], counters: Record<string, Counter>): Record<string, DayVolume> {
  const out: Record<string, DayVolume> = {};
  const add = (asset: string, counter: Counter, trades: number, volume: number) => {
    const day = (out[asset] ??= {});
    day[counter] = { trades: (day[counter]?.trades ?? 0) + trades, volume: (day[counter]?.volume ?? 0) + volume };
  };
  for (const r of rows) {
    if (counters[r.bought_asset]) add(r.sold_asset, counters[r.bought_asset], Number(r.trades), Number(r.bought));
    if (counters[r.sold_asset]) add(r.bought_asset, counters[r.sold_asset], Number(r.trades), Number(r.sold));
  }
  return out;
}

export interface HistorySeries {
  /** Every UTC day from the first with data to the last, oldest first. */
  days: string[];
  /** Null before the first snapshot and after the last. */
  holders: Array<number | null>;
  /** In the asset's units, null like holders. */
  supply: Array<number | null>;
  /** For a day without a snapshot between two that have one, the day its numbers come from. */
  carried: Array<string | null>;
  /** Per counter, in its units: 0 for a day without trades, null for a day not read. */
  volume: Partial<Record<Counter, Array<number | null>>>;
}

export function historySeries({ counters, snapshots, volume }: AssetHistory, decimals: number): HistorySeries {
  // a day copied twice keeps its later copy
  const snapshotOf = new Map<string, ChAssetSnapshot>();
  for (const row of snapshots) {
    const seen = snapshotOf.get(row.day);
    if (!seen || row.computed_at > seen.computed_at) snapshotOf.set(row.day, row);
  }
  const volumeOf = new Map(volume.map((v) => [v.day, v.counters]));

  const known = [...snapshotOf.keys(), ...volumeOf.keys()].sort();
  const days: string[] = [];
  if (known.length) {
    for (let t = Date.parse(known[0]); t <= Date.parse(known[known.length - 1]); t += DAY_MS) {
      days.push(new Date(t).toISOString().slice(0, 10));
    }
  }
  // a day the snapshot is missing shows the last one before it, but a gap at
  // the end stays a gap: its snapshot isn't in yet
  const shown: Array<ChAssetSnapshot | null> = [];
  let last: ChAssetSnapshot | null = null;
  for (const d of days) {
    last = snapshotOf.get(d) ?? last;
    shown.push(last);
  }
  for (let i = days.length - 1; i >= 0 && !snapshotOf.has(days[i]); i--) shown[i] = null;

  const scale = 10 ** decimals;
  return {
    days,
    holders: shown.map((s) => (s ? Number(s.holders) : null)),
    supply: shown.map((s) => (s ? Number(s.supply) / scale : null)),
    carried: shown.map((s, i) => (s && s.day !== days[i] ? s.day : null)),
    volume: Object.fromEntries(
      counters.map((c) => [
        c,
        days.map((d) => (volumeOf.has(d) ? (volumeOf.get(d)![c]?.volume ?? 0) / COUNTER_UNITS : null)),
      ]),
    ),
  };
}
