import "server-only";
import { unstable_cache } from "next/cache";
import { assetKey, type AssetIdentity } from "./assetId";
import { indexerRead } from "./indexer/client";
import { indexedOnOffers, indexedPairHours, type IndexedOnOffers } from "./indexer/market";
import { toMarketHours, type MarketHour } from "./marketSeries";
import { USDC } from "./prices";

/** How far back the asset page's market reaches. */
export const MARKET_DAYS = 7;

export interface AssetMarket {
  /** What prices are quoted in: XLM, or USDC for XLM itself. */
  counter: "XLM" | "USDC";
  hours: MarketHour[];
  onOffers: IndexedOnOffers;
}

// a week of fills is about 2 GB to read, so a pair is read at most every 15
// minutes; open offers change once a day. Both throw on indexer errors so
// unstable_cache keeps only good results
const cachedPairHours = unstable_cache(indexedPairHours, ["pair-hours"], { revalidate: 900 });
const cachedOnOffers = unstable_cache(indexedOnOffers, ["on-offers"], { revalidate: 3600 });

/**
 * An asset's last week on the DEX against XLM (XLM against USDC), and how
 * much of it sits in open offers. Mainnet only: null on testnet or when the
 * indexer fails.
 */
export function getAssetMarket(identity: AssetIdentity): Promise<AssetMarket | null> {
  const base = assetKey(identity);
  const counter = base === "native" ? USDC : "native";
  return indexerRead(`market ${base.split(":")[0]}`, async () => {
    const [rows, onOffers] = await Promise.all([
      cachedPairHours(base, counter, MARKET_DAYS),
      cachedOnOffers(base),
    ]);
    return {
      counter: counter === "native" ? ("XLM" as const) : ("USDC" as const),
      hours: toMarketHours(rows, Date.now() / 1000),
      onOffers,
    };
  });
}
