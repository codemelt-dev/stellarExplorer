import "server-only";
import { unstable_cache } from "next/cache";
import { StrKey } from "@stellar/stellar-sdk";
import { indexedPricePools } from "./indexer/prices";
import { indexedPoolDailyFlows, type ChPoolDayFlow } from "./indexer/pools";
import { indexedSorobanDailyReserves, indexedSorobanReservesBefore } from "./indexer/sorobanPools";
import { indexedLedgerDays } from "./indexer/stats";
import { anchorBook, buildPriceBook, type AnchorBook, type PricePool } from "./prices";
import { carryForward, unbrokenDays, walkBack, type Reserves } from "./reserveHistory";

// Pools day by day, from our index: classic reserves walked back from today's
// through each day's transfers, Soroban reserves from each day's last event,
// and each day's prices from the price pools walked back the same way

// a quarter of history, once the indexer has it
const HISTORY_DAYS = 90;

export const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;

/** A classic pool as the walk back needs it: its assets and reserves now. */
type ClassicPool = Pick<PricePool, "pool_id" | "asset_a" | "asset_b" | "reserve_a" | "reserve_b">;

const addressOf = (id: string) => StrKey.encodeLiquidityPool(Buffer.from(id, "hex"));

/**
 * End-of-day reserves of each classic pool over `days`, oldest first, null
 * where they can't be rebuilt.
 */
export async function classicReserveHistory(pools: ClassicPool[], days: string[]): Promise<Array<Array<Reserves | null>>> {
  if (!pools.length || !days.length) return [];
  // a day's flows only matter for the days before it
  const rows = days.length > 1 ? await indexedPoolDailyFlows(pools.map((p) => addressOf(p.pool_id)), days[1]) : [];
  const byPool = new Map<string, ChPoolDayFlow[]>();
  for (const row of rows) {
    const list = byPool.get(row.pool);
    if (list) list.push(row);
    else byPool.set(row.pool, [row]);
  }
  return pools.map((pool) => {
    const flows = new Map<string, Reserves>();
    for (const f of byPool.get(addressOf(pool.pool_id)) ?? []) {
      const day = flows.get(f.day) ?? [0n, 0n];
      if (f.asset_key === pool.asset_a) day[0] += BigInt(f.net);
      else if (f.asset_key === pool.asset_b) day[1] += BigInt(f.net);
      flows.set(f.day, day);
    }
    return walkBack([BigInt(pool.reserve_a), BigInt(pool.reserve_b)], flows, days);
  });
}

/**
 * Each Soroban pool's reserves and pool state events at the end of each of
 * `days`, carried from the month before. Null until its first one: a pool
 * quiet that long joins at its first reserves update.
 */
export async function sorobanReserveHistory(
  ids: string[],
  days: string[],
): Promise<Array<Array<{ reserves: string; state: string } | null>>> {
  if (!ids.length || !days.length) return [];
  const [rows, before] = await Promise.all([
    indexedSorobanDailyReserves(ids, days[0]),
    indexedSorobanReservesBefore(ids, days[0]),
  ]);
  return ids.map((id) => {
    const mine = rows.filter((r) => r.contract_id === id);
    const seed = before.find((r) => r.contract_id === id);
    const reserves = carryForward(
      new Map(mine.filter((r) => r.reserves).map((r) => [r.day, r.reserves])),
      days,
      seed?.reserves || null,
    );
    const state = carryForward(new Map(mine.filter((r) => r.state).map((r) => [r.day, r.state])), days, seed?.state || null);
    return days.map((_, i) => (reserves[i] ? { reserves: reserves[i]!, state: state[i] ?? "" } : null));
  });
}

export interface PriceHistory {
  /** UTC days we can rebuild, oldest first, today last. */
  days: string[];
  /** Each day's end-of-day prices. */
  books: AnchorBook[];
}

// throws on indexer errors so unstable_cache keeps only good results
async function loadPriceHistory(): Promise<PriceHistory> {
  const [indexed, pools] = await Promise.all([indexedLedgerDays(HISTORY_DAYS), indexedPricePools()]);
  const days = unbrokenDays(indexed, new Date().toISOString().slice(0, 10));
  const series = await classicReserveHistory(pools, days);
  const books = days.map((_, i) =>
    anchorBook(
      buildPriceBook(
        pools.flatMap((pool, k) => {
          const r = series[k]?.[i];
          return r ? [{ ...pool, reserve_a: String(r[0]), reserve_b: String(r[1]) }] : [];
        }),
      ),
    ),
  );
  return { days, books };
}

/** The days we can rebuild and each day's prices, cached for the hour. */
export const getPriceHistory = unstable_cache(loadPriceHistory, ["price-history"], { revalidate: 3600 });
