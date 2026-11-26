import "server-only";
import { chQuery } from "./client";

export interface ChPairHour {
  /** Unix seconds, start of the UTC hour. */
  hour: number;
  trades: string | number;
  /** Base units, as digit strings. */
  base_volume: string;
  counter_volume: string;
  /** Counter per base. */
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * A pair's DEX fills per hour over the last `days` days, order book and pools,
 * in both directions: `sold_asset` is what the seller gave, so the price of
 * base in counter is the counter side over the base side either way. The
 * table is sorted by ledger, so this reads every fill of those days (about
 * 2 GB a week): callers cache it.
 */
export async function indexedPairHours(base: string, counter: string, days: number): Promise<ChPairHour[]> {
  return chQuery<ChPairHour>(
    `SELECT toUnixTimestamp(toStartOfHour(closed_at)) AS hour, count() AS trades,
            toString(sum(base_amount)) AS base_volume, toString(sum(counter_amount)) AS counter_volume,
            argMin(price, (ledger_sequence, tx_index, op_index, position)) AS open, max(price) AS high, min(price) AS low,
            argMax(price, (ledger_sequence, tx_index, op_index, position)) AS close
     FROM (
       SELECT ledger_sequence, tx_index, op_index, position, closed_at,
              toInt128(if(sold_asset = {base:String}, sold_amount, bought_amount)) AS base_amount,
              toInt128(if(sold_asset = {base:String}, bought_amount, sold_amount)) AS counter_amount,
              counter_amount / base_amount AS price
       FROM trades
       WHERE closed_at >= now() - INTERVAL {days:UInt32} DAY
         AND ((sold_asset = {base:String} AND bought_asset = {counter:String})
           OR (sold_asset = {counter:String} AND bought_asset = {base:String}))
         AND sold_amount > 0 AND bought_amount > 0)
     GROUP BY hour ORDER BY hour`,
    { base, counter, days },
  );
}

export interface ChDayFills {
  sold_asset: string;
  bought_asset: string;
  trades: string | number;
  /** Base units, as digit strings. */
  sold: string;
  bought: string;
}

/**
 * One UTC day (YYYY-MM-DD) of DEX fills with one of `counters` on a side,
 * order book and pools, per pair and direction. trades is sorted by ledger,
 * so the day's ledgers are found in `ledgers` first; every asset's day comes
 * from this one read, in about half a second.
 */
export async function indexedDayFills(day: string, counters: string[]): Promise<ChDayFills[]> {
  return chQuery<ChDayFills>(
    `SELECT sold_asset, bought_asset, count() AS trades,
            toString(sum(sold_amount)) AS sold, toString(sum(bought_amount)) AS bought
     FROM trades
     WHERE ledger_sequence BETWEEN
           (SELECT ifNull(minOrNull(sequence), {max:UInt32}) FROM ledgers WHERE closed_at >= {day:Date})
       AND (SELECT ifNull(minOrNull(sequence), {max:UInt32}) FROM ledgers WHERE closed_at >= {day:Date} + 1) - 1
       AND (sold_asset IN {counters:Array(String)} OR bought_asset IN {counters:Array(String)})
       AND sold_amount > 0 AND bought_amount > 0
     GROUP BY sold_asset, bought_asset
     SETTINGS max_threads = 4`,
    { day, max: 0xffffffff, counters: `[${counters.map((c) => `'${c}'`).join(",")}]` },
  );
}

export interface IndexedOnOffers {
  /** Base units in holders' open offers today, null when the asset isn't indexed. */
  today: string | null;
  supply: string | null;
  /** One point a day, oldest first, from 2026-11-11 when the column started. */
  days: Array<{ day: string; amount: string }>;
}

/**
 * What holders' open offers may sell of an asset: their selling liabilities.
 * An issuer's offers of its own asset aren't counted, they lock nothing up.
 */
export async function indexedOnOffers(asset: string): Promise<IndexedOnOffers> {
  const [[today], days] = await Promise.all([
    chQuery<{ on_offers: string; supply: string }>(
      `SELECT toString(on_offers) AS on_offers, toString(supply) AS supply FROM assets WHERE asset = {asset:String}`,
      { asset },
    ),
    chQuery<{ day: string; amount: string }>(
      `SELECT toString(date) AS day, toString(on_offers) AS amount FROM asset_snapshots
       WHERE asset = {asset:String} AND on_offers IS NOT NULL ORDER BY date`,
      { asset },
    ),
  ]);
  return { today: today?.on_offers ?? null, supply: today?.supply ?? null, days };
}
