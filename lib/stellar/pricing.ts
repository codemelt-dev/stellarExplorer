import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { assetKey, type AssetIdentity } from "./assetId";
import { indexerActive, indexerRead, withIndexer } from "./indexer/client";
import { indexedXlmPrice } from "./indexer/assets";
import { indexedPricePools } from "./indexer/prices";
import { buildPriceBook, orderBookPrice, type AssetPrice, type PriceBook } from "./prices";

export type { AssetPrice, PriceBook };

// reserves move with every trade, a couple of minutes old is close enough
const cachedPools = unstable_cache(indexedPricePools, ["price-pools"], { revalidate: 120 });

/** Mainnet prices from our own pools, whatever network is selected. Null when the indexer is off or failed. */
export const getPriceBook = cache(
  (): Promise<PriceBook | null> =>
    withIndexer("price book", async () => buildPriceBook(await cachedPools()), async () => null, {
      anyNetwork: true,
    }),
);

/**
 * An asset's price on mainnet: from its deepest pool, else the order book's
 * mid against XLM. Null on testnet or when nothing prices it.
 */
export async function getAssetPrice(identity: AssetIdentity): Promise<AssetPrice | null> {
  if (!(await indexerActive())) return null;
  const book = await getPriceBook();
  if (!book) return null;
  const key = assetKey(identity);
  const pooled = book.assets.get(key);
  if (pooled || key === "native") return pooled ?? null;
  const mid = await indexerRead("order book price", () => indexedXlmPrice(key));
  return mid === null ? null : orderBookPrice(book, mid);
}
