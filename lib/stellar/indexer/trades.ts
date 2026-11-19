import "server-only";
import type { DexTrade } from "../defi";
import { chQuery } from "./client";
import { toDexTrade, type ChTrade } from "./tradeView";

/**
 * The DEX's latest fills, newest first: offers matched in the order book and
 * swaps with classic pools. The inner query finds the ledger `limit` fills
 * reach back to, so only those ledgers are read.
 */
export async function indexedLatestTrades(limit: number): Promise<DexTrade[]> {
  const rows = await chQuery<ChTrade>(
    `SELECT ledger_sequence, tx_index, op_index, position, toUnixTimestamp(closed_at) AS closed_ts, venue,
            seller, buyer, sold_asset, toString(sold_amount) AS sold_amount,
            bought_asset, toString(bought_amount) AS bought_amount
     FROM trades
     WHERE ledger_sequence >= (SELECT ifNull(minOrNull(ledger_sequence), {max:UInt32}) FROM (
             SELECT ledger_sequence FROM trades ORDER BY ledger_sequence DESC LIMIT {limit:UInt32}))
     ORDER BY ledger_sequence DESC, tx_index DESC, op_index DESC, position DESC
     LIMIT {limit:UInt32}`,
    { limit, max: 0xffffffff },
  );
  return rows.map(toDexTrade);
}
