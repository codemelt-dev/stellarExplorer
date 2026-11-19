import "server-only";
import { apiGet } from "./client";
import { MIN_DEPTH_XLM, USDC, type PricePool } from "../prices";

const COLUMNS = "pool_id,asset_a,asset_b,reserve_a,reserve_b";
// the API returns at most this many rows per request
const PAGE = 200;
const MAX_PAGES = 10;
const STROOPS = 10_000_000;

async function allPools(query: Record<string, string>): Promise<PricePool[]> {
  const rows: PricePool[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await apiGet<PricePool>("liquidity_pools", {
      ...query,
      select: COLUMNS,
      order: "pool_id",
      limit: String(PAGE),
      offset: String(page * PAGE),
    });
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/**
 * The pools prices come from, live: XLM pools holding at least MIN_DEPTH_XLM,
 * and Circle USDC pools holding at least 100 USDC.
 */
export async function indexedPricePools(): Promise<PricePool[]> {
  const usdcMin = 100 * STROOPS;
  const [vsXlm, vsUsdc] = await Promise.all([
    allPools({ asset_a: "eq.native", reserve_a: `gte.${MIN_DEPTH_XLM * STROOPS}` }),
    allPools({
      or: `(and(asset_a.eq.${USDC},reserve_a.gte.${usdcMin}),and(asset_b.eq.${USDC},reserve_b.gte.${usdcMin}))`,
    }),
  ]);
  return [...vsXlm, ...vsUsdc];
}
