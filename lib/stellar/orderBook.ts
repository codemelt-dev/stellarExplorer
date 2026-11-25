import "server-only";
import { unstable_cache } from "next/cache";
import { freshCache } from "../cache";
import { withIndexer } from "./indexer/client";
import { indexedPricePools } from "./indexer/prices";
import {
  indexedOffers,
  indexedOffersDaily,
  indexedOrderBookDayTrades,
  indexedOrderBookTrades,
  type ChOffers,
  type ChOrderBookTrades,
} from "./indexer/orderBook";
import { anchorAssets, buildPriceBook, fromAnchorBook, valueBySide, type AnchorBook, type PriceBook } from "./prices";
import { dayStart, getPriceHistory, type PriceHistory } from "./poolHistory";
import type { TvlPoint } from "./defi";

const LEDGERS_PER_DAY = 17_280;
const units = (stroops: string) => Number(stroops) / 10_000_000;

/** The Stellar DEX order book, added up. */
export interface OrderBookTotals {
  tvlUsd: number;
  volume24hUsd: number;
  trades24h: number;
  /** Asset pairs with a fill in the last day, either way round. */
  markets24h: number;
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

// a fill's two legs are worth the same; value it by the more trusted one
function volumeUsd(book: PriceBook, trades: ChOrderBookTrades[]): number {
  return trades.reduce((sum, t) => {
    const value = valueBySide(
      book,
      { asset: t.sold_asset, amount: units(t.sold) },
      { asset: t.bought_asset, amount: units(t.bought) },
      false,
    );
    return sum + (value?.usd ?? 0);
  }, 0);
}

// throws on indexer errors so unstable_cache keeps only good results
async function loadTotals(): Promise<OrderBookTotals> {
  const book = buildPriceBook(await indexedPricePools());
  const [offers, trades] = await Promise.all([
    indexedOffers(anchorAssets(book).map((a) => a.asset)),
    indexedOrderBookTrades(LEDGERS_PER_DAY),
  ]);
  return {
    tvlUsd: offersUsd(book, offers),
    volume24hUsd: volumeUsd(book, trades),
    trades24h: trades.reduce((sum, t) => sum + Number(t.trades), 0),
    markets24h: new Set(trades.map((t) => [t.sold_asset, t.bought_asset].sort().join(" "))).size,
  };
}

const cachedTotals = freshCache(loadTotals, ["order-book-totals", "markets"], { revalidate: 120 });

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

/** The daily values with today's live one on the end: today's daily copy isn't made until the day ends. */
export function withLiveDay(history: TvlPoint[], tvlUsd: number): TvlPoint[] {
  const today = Math.floor(Date.now() / 86_400_000) * 86_400;
  return [...history.filter((d) => d.date < today), { date: today, tvl: tvlUsd }];
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

// a day not read yet takes about a second, so after a deploy the oldest days
// fill in over a few refreshes instead of holding one page up
const VOLUME_BUDGET_MS = 8_000;

async function loadDayVolume(prices: AnchorBook, day: string): Promise<number> {
  return volumeUsd(fromAnchorBook(prices), await indexedOrderBookDayTrades(day));
}

/**
 * Order book volume for each complete UTC day, at that day's prices, oldest
 * first. Mainnet facts shown on every network; null when the indexer is off or failed.
 */
export function getOrderBookVolumeHistory(): Promise<Array<{ date: number; volume: number }> | null> {
  return withIndexer<Array<{ date: number; volume: number }> | null>(
    "order book volume history",
    async () => {
      const { days, books } = await getPriceHistory();
      const started = Date.now();
      const out: Array<{ date: number; volume: number }> = [];
      // newest first, one at a time. Today is still trading, and a past day's fills don't change
      for (let i = days.length - 2; i >= 0 && Date.now() - started < VOLUME_BUDGET_MS; i--) {
        try {
          const volume = await unstable_cache(() => loadDayVolume(books[i], days[i]), ["order-book-day-volume", days[i]], {
            revalidate: 7 * 86_400,
          })();
          out.unshift({ date: dayStart(days[i]), volume });
        } catch (error) {
          // the days read so far still chart; the rest come on a later refresh
          if (!out.length) throw error;
          console.warn(`[indexer] order book volume for ${days[i]}: failed`, error instanceof Error ? error.message : error);
          break;
        }
      }
      return out;
    },
    async () => null,
    { anyNetwork: true },
  );
}
