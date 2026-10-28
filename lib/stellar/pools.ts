import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { StrKey } from "@stellar/stellar-sdk";
import { stroopsToLumens } from "./amount";
import { fromAssetKey, type AssetIdentity } from "./assetId";
import { indexerRead } from "./indexer/client";
import { indexedPricePools } from "./indexer/prices";
import {
  indexedLivePools,
  indexedPool,
  indexedPoolActivity,
  indexedPoolCandidates,
  indexedPoolDailyTrades,
  indexedPoolTrades,
  type ChPool,
  type ChPoolTrades,
} from "./indexer/pools";
import { anchorAssets, buildPriceBook, valueBySide, type PriceBook } from "./prices";

const LEDGERS_PER_DAY = 17_280;
const TOP_POOLS = 100;
const ACTIVITY = 50;
const DAYS = 30;

const units = (stroops: string | number) => Number(stroops) / 10_000_000;
const identityOf = (key: string): AssetIdentity =>
  fromAssetKey(key) ?? { kind: "contract", contractId: key };

export interface PoolSide {
  key: string;
  identity: AssetIdentity;
  /** Whole units in the pool. */
  amount: number;
  /** The same, exact, as a decimal string. */
  exact: string;
  /** USD value of this side, when the asset has a price. */
  usd: number | null;
}

export interface PoolSummary {
  /** Hex pool id. */
  id: string;
  /** The pool's L address, as transfers name it. */
  address: string;
  a: PoolSide;
  b: PoolSide;
  feeBp: number;
  shares: number;
  /** Accounts holding shares (trustlines to the pool). */
  accounts: number;
  tvlUsd: number | null;
  tvlXlm: number | null;
  /** The asset the pool was valued by. */
  valuedBy: string | null;
  volume24hUsd: number | null;
  trades24h: number;
  lastModifiedLedger: number;
}

export type PoolActivityKind = "trade" | "deposit" | "withdraw";

export interface PoolActivity {
  kind: PoolActivityKind;
  account: string;
  txHash: string;
  createdAt: string;
  /** Into the pool for a trade's first leg and every deposit leg. */
  /** Amounts are exact decimal strings. */
  legs: Array<{ identity: AssetIdentity; amount: string; into: boolean }>;
}

export interface PoolDetail extends PoolSummary {
  /** Trade volume in USD per UTC day, valued at today's prices. */
  daily: Array<{ date: number; volume: number }>;
  activity: PoolActivity[];
}

/** A pool id from the URL: the hex id or the L address. */
export function poolIdOf(param: string): string | null {
  const value = decodeURIComponent(param).trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
  if (StrKey.isValidLiquidityPool(value)) return StrKey.decodeLiquidityPool(value).toString("hex");
  return null;
}

const addressOf = (id: string) => StrKey.encodeLiquidityPool(Buffer.from(id, "hex"));

function side(book: PriceBook, key: string, reserve: string): PoolSide {
  const amount = units(reserve);
  const usd = book.assets.get(key)?.usd;
  return {
    key,
    identity: identityOf(key),
    amount,
    exact: stroopsToLumens(reserve),
    usd: usd == null ? null : amount * usd,
  };
}

function summarize(book: PriceBook, pool: ChPool): PoolSummary {
  const a = side(book, pool.asset_a, pool.reserve_a);
  const b = side(book, pool.asset_b, pool.reserve_b);
  const value = valueBySide(book, { asset: a.key, amount: a.amount }, { asset: b.key, amount: b.amount });
  return {
    id: pool.pool_id,
    address: addressOf(pool.pool_id),
    a,
    b,
    feeBp: Number(pool.fee_bp),
    shares: units(pool.total_shares),
    accounts: Number(pool.trustlines),
    tvlUsd: value?.usd ?? null,
    tvlXlm: value?.xlm ?? null,
    valuedBy: value?.by ?? null,
    volume24hUsd: null,
    trades24h: 0,
    lastModifiedLedger: Number(pool.last_modified_ledger),
  };
}

// a trade's two legs are worth the same; value it by the more trusted one
function tradeValueUsd(book: PriceBook, row: Omit<ChPoolTrades, "pool">): number | null {
  const value = valueBySide(
    book,
    { asset: row.asset_in, amount: units(row.amount_in) },
    { asset: row.asset_out, amount: units(row.amount_out) },
    false,
  );
  return value?.usd ?? null;
}

function withVolume(book: PriceBook, pool: PoolSummary, rows: ChPoolTrades[]): PoolSummary {
  const mine = rows.filter((r) => r.pool === pool.address);
  const values = mine.map((r) => tradeValueUsd(book, r));
  return {
    ...pool,
    volume24hUsd: values.some((v) => v !== null) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null,
    trades24h: mine.reduce((s, r) => s + Number(r.trades), 0),
  };
}

// throws on indexer errors so unstable_cache keeps only good results
async function loadTopPools(): Promise<PoolSummary[]> {
  const book = buildPriceBook(await indexedPricePools());
  const ids = await indexedPoolCandidates(anchorAssets(book), TOP_POOLS + 50);
  const ranked = (await indexedLivePools(ids))
    .map((pool) => summarize(book, pool))
    .filter((pool) => pool.tvlXlm !== null)
    .sort((x, y) => y.tvlXlm! - x.tvlXlm!)
    .slice(0, TOP_POOLS);
  const trades = await indexedPoolTrades(
    ranked.map((p) => p.address),
    LEDGERS_PER_DAY,
  );
  return ranked.map((pool) => withVolume(book, pool, trades));
}

const cachedTopPools = unstable_cache(loadTopPools, ["top-pools"], { revalidate: 120 });

/** The most valuable pools, live. Indexer only: null on testnet or when it failed. */
export function getTopPools(): Promise<PoolSummary[] | null> {
  return indexerRead("top pools", cachedTopPools);
}

function activityOf(op: Awaited<ReturnType<typeof indexedPoolActivity>>[number]): PoolActivity {
  const legs = op.legs.map(([key, amount]) => ({
    identity: identityOf(key),
    amount: stroopsToLumens(amount.replace("-", "")),
    into: !amount.startsWith("-"),
  }));
  const ins = legs.filter((l) => l.into).length;
  const kind: PoolActivityKind = ins === legs.length ? "deposit" : ins === 0 ? "withdraw" : "trade";
  return {
    kind,
    account: op.counterparty,
    txHash: op.tx_hash,
    createdAt: `${op.closed_at.replace(" ", "T")}Z`,
    // a trade reads "gave X for Y": what went in first
    legs: kind === "trade" ? [...legs].sort((x, y) => Number(y.into) - Number(x.into)) : legs,
  };
}

function dailyVolume(book: PriceBook, rows: Awaited<ReturnType<typeof indexedPoolDailyTrades>>) {
  if (!rows.length) return [];
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.day, (byDay.get(row.day) ?? 0) + (tradeValueUsd(book, row) ?? 0));
  // every day from the first with trades to today, quiet days as zero
  const points: Array<{ date: number; volume: number }> = [];
  const first = Date.parse(`${rows[0].day}T00:00:00Z`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  for (let t = first; t <= today; t += 86_400_000) {
    points.push({ date: t / 1000, volume: byDay.get(new Date(t).toISOString().slice(0, 10)) ?? 0 });
  }
  return points;
}

/**
 * One pool, live: reserves, value, volume, daily volume and latest activity.
 * "missing" when there is no such pool, null when the indexer is off or failed.
 */
export const getPool = cache(
  (id: string): Promise<PoolDetail | "missing" | null> =>
    indexerRead(`pool ${id.slice(0, 8)}`, async () => {
      const pool = await indexedPool(id);
      if (!pool) return "missing" as const;
      const book = buildPriceBook(await indexedPricePools());
      const summary = summarize(book, pool);
      const [trades, daily, activity] = await Promise.all([
        indexedPoolTrades([summary.address], LEDGERS_PER_DAY),
        indexedPoolDailyTrades(summary.address, DAYS),
        indexedPoolActivity(summary.address, ACTIVITY),
      ]);
      return {
        ...withVolume(book, summary, trades),
        daily: dailyVolume(book, daily),
        activity: activity.map(activityOf),
      };
    }),
);
