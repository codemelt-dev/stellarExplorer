import "server-only";
import { unstable_cache } from "next/cache";
import { withIndexer } from "./indexer/client";
import { indexedPricePools } from "./indexer/prices";
import { indexedOffers, indexedOffersDaily, indexedOrderBookTrades, type ChOffers } from "./indexer/orderBook";
import { anchorAssets, buildPriceBook, fromAnchorBook, valueBySide, type PriceBook } from "./prices";
import { dayStart, getPriceHistory, type PriceHistory } from "./poolHistory";
import type { TvlPoint } from "./defi";

const LEDGERS_PER_DAY = 17_280;
const units = (stroops: string) => Number(stroops) / 10_000_000;

/** The Stellar DEX order book, added up. */
export interface OrderBookTotals {
  tvlUsd: number;
  volume24hUsd: number;
  trades24h: number;
}

// only assets a deep pool prices are counted, so a junk token's giant offers
// can't make the book look rich
function offersUsd(book: PriceBook, rows: ChOffers[]): number {
  if (book.xlmUsd === null) return 0;
  return rows.reduce((sum, r) => {
    const price = book.assets.get(r.asset);
    return price ? sum + units(r.amount) * price.xlm * book.xlmUsd! : sum;
  }, 0);
}

// throws on indexer errors so unstable_cache keeps only good results
async function loadTotals(): Promise<OrderBookTotals> {
  const book = buildPriceBook(await indexedPricePools());
  const [offers, trades] = await Promise.all([
    indexedOffers(anchorAssets(book).map((a) => a.asset)),
    indexedOrderBookTrades(LEDGERS_PER_DAY),
  ]);
  // a fill's two legs are worth the same; value it by the more trusted one
  const volume = trades.reduce((sum, t) => {
    const value = valueBySide(
      book,
      { asset: t.sold_asset, amount: units(t.sold) },
      { asset: t.bought_asset, amount: units(t.bought) },
      false,
    );
    return sum + (value?.usd ?? 0);
  }, 0);
  return {
    tvlUsd: offersUsd(book, offers),
    volume24hUsd: volume,
    trades24h: trades.reduce((sum, t) => sum + Number(t.trades), 0),
  };
}

const cachedTotals = unstable_cache(loadTotals, ["order-book-totals"], { revalidate: 120 });

/** Value on offer and 24h fills. Mainnet facts shown on every network; null when the indexer is off or failed. */
export function getOrderBookTotals(): Promise<OrderBookTotals | null> {
  return withIndexer<OrderBookTotals | null>("order book totals", cachedTotals, async () => null, {
    anyNetwork: true,
  });
}

async function loadHistory({ days, books }: PriceHistory): Promise<TvlPoint[]> {
  const assets = [...new Set(books.flatMap((b) => b.anchors.map(([asset]) => asset)))];
  const rows = await indexedOffersDaily(assets, days.length);
  const byDay = new Map<string, ChOffers[]>();
  for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  return days.flatMap((day, i) => {
    const offers = byDay.get(day);
    return offers ? [{ date: dayStart(day), tvl: offersUsd(fromAnchorBook(books[i]), offers) }] : [];
  });
}

/** Value on offer at the end of each day the daily copies cover, at that day's prices. Null when the indexer is off or failed. */
export function getOrderBookTvlHistory(): Promise<TvlPoint[] | null> {
  return withIndexer<TvlPoint[] | null>(
    "order book tvl history",
    async () => {
      // unstable_cache skips its cache inside another one, so prices are read first
      const prices = await getPriceHistory();
      return unstable_cache(() => loadHistory(prices), ["order-book-history"], { revalidate: 3600 })();
    },
    async () => null,
    { anyNetwork: true },
  );
}
