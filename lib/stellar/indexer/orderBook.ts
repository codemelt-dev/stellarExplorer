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

/**
 * Order book fills over the last `ledgers` ledgers, per pair. An issuer
 * handing over its own asset is issuing it, not trading, so those are left out.
 */
export async function indexedOrderBookTrades(ledgers: number): Promise<ChOrderBookTrades[]> {
  return chQuery<ChOrderBookTrades>(
    `SELECT sold_asset, bought_asset, toString(sum(sold_amount)) AS sold,
            toString(sum(bought_amount)) AS bought, count() AS trades
     FROM trades
     WHERE ledger_sequence > (SELECT max(sequence) FROM ledgers) - {ledgers:UInt32}
       AND venue = 'orderbook'
       AND NOT endsWith(sold_asset, concat(':', seller))
       AND NOT endsWith(bought_asset, concat(':', buyer))
     GROUP BY sold_asset, bought_asset`,
    { ledgers },
  );
}
