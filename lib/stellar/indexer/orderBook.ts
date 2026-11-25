import "server-only";
import { chQuery } from "./client";

const list = (xs: string[]) => `[${xs.map((x) => `'${x}'`).join(",")}]`;

export interface ChOffers {
  asset: string;
  /** Stroops. */
  amount: string;
}

/** What holders' open offers sell of each asset today. Issuers' offers of their own asset aren't counted. */
export async function indexedOffers(assets: string[]): Promise<ChOffers[]> {
  if (!assets.length) return [];
  return chQuery<ChOffers>(
    `SELECT asset, toString(on_offers) AS amount FROM assets
     WHERE asset IN {assets:Array(String)} AND on_offers > 0`,
    { assets: list(assets) },
  );
}

/** The same at the end of each UTC day, from the daily copies, which carry it from 2026-11-11. */
export async function indexedOffersDaily(assets: string[], days: number): Promise<Array<ChOffers & { day: string }>> {
  if (!assets.length) return [];
  return chQuery<ChOffers & { day: string }>(
    `SELECT toString(date) AS day, asset, toString(on_offers) AS amount FROM asset_snapshots
     WHERE asset IN {assets:Array(String)} AND on_offers IS NOT NULL AND date >= today() - {days:UInt32}`,
    { assets: list(assets), days },
  );
}

export interface ChOrderBookTrades {
  sold_asset: string;
  bought_asset: string;
  sold: string;
  bought: string;
  trades: string;
}

// order book fills per pair. An issuer handing over its own asset is issuing
// it, not trading, so those are left out
const fills = (ledgers: string) => `
  SELECT sold_asset, bought_asset, toString(sum(sold_amount)) AS sold,
         toString(sum(bought_amount)) AS bought, count() AS trades
  FROM trades
  WHERE ${ledgers}
    AND venue = 'orderbook'
    AND NOT endsWith(sold_asset, concat(':', seller))
    AND NOT endsWith(bought_asset, concat(':', buyer))
  GROUP BY sold_asset, bought_asset`;

/** Order book fills over the last `ledgers` ledgers, per pair. */
export async function indexedOrderBookTrades(ledgers: number): Promise<ChOrderBookTrades[]> {
  return chQuery<ChOrderBookTrades>(fills("ledger_sequence > (SELECT max(sequence) FROM ledgers) - {ledgers:UInt32}"), {
    ledgers,
  });
}

/**
 * Order book fills over one UTC day (YYYY-MM-DD), per pair. trades is sorted
 * by ledger, so the day's ledgers are found in `ledgers` first; about 200,000
 * fills a day add up on four threads in under a second.
 */
export async function indexedOrderBookDayTrades(day: string): Promise<ChOrderBookTrades[]> {
  return chQuery<ChOrderBookTrades>(
    `${fills(`ledger_sequence BETWEEN
         (SELECT ifNull(minOrNull(sequence), {max:UInt32}) FROM ledgers WHERE closed_at >= {day:Date})
     AND (SELECT ifNull(minOrNull(sequence), {max:UInt32}) FROM ledgers WHERE closed_at >= {day:Date} + 1) - 1`)}
     SETTINGS max_threads = 4`,
    { day, max: 0xffffffff },
  );
}
