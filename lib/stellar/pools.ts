import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { StrKey } from "@stellar/stellar-sdk";
import { stroopsToLumens } from "./amount";
import { fromAssetKey, type AssetIdentity } from "./assetId";
import { indexerRead, withIndexer } from "./indexer/client";
import { indexedPricePools } from "./indexer/prices";
import {
  indexedLivePools,
  indexedPool,
  indexedPoolActivity,
  indexedPoolCandidates,
  indexedPoolDailyTrades,
  indexedPoolTrades,
  indexedPoolsActivity,
  type ChPool,
  type ChPoolTrades,
} from "./indexer/pools";
import {
  indexedAquariusEvents,
  indexedAssetContracts,
  indexedContractBalances,
  indexedContractTokens,
  indexedEventCount,
  indexedSorobanCandidates,
  indexedSorobanPools,
  indexedSorobanReserves,
} from "./indexer/sorobanPools";
import { anchorAssets, buildPriceBook, valueByHoldings, valueBySide, type PriceBook } from "./prices";
import {
  SOROSWAP_FEE_BP,
  aquariusPool,
  feeBpOf,
  reservesOf,
  sortTokens,
  tickPrice,
  topicAddress,
  type PoolKind,
  type SorobanProtocol,
} from "./sorobanAmm";

const LEDGERS_PER_DAY = 17_280;
const TOP_POOLS = 100;
// classic pools counted in the protocol totals: the top 500 hold about 99% of the value
const CLASSIC_POOLS = 500;
const ACTIVITY = 50;
const DAYS = 30;
// contracts to check for Soroban pools, by what they hold
const SOROBAN_CANDIDATES = 400;
// recent trades and reserve updates to tell an Aquarius pool's kind from
const AQUARIUS_EVENTS = 12;
// the busiest pools emit a few hundred thousand events a month; a token like
// XLM emits hundreds of millions, too many to read through for pool events
const MAX_POOL_EVENTS = 2_000_000;

const units = (stroops: string | number) => Number(stroops) / 10_000_000;
const identityOf = (key: string): AssetIdentity =>
  fromAssetKey(key) ?? { kind: "contract", contractId: key };

export type PoolProtocol = "classic" | SorobanProtocol;
export type { PoolKind };

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
  /** Hex pool id of a classic pool, contract id of a Soroban one. */
  id: string;
  /** The address transfers name it by: L… or C…. */
  address: string;
  protocol: PoolProtocol;
  /** Null for an Aquarius pool whose recent trades were too small to tell. */
  kind: PoolKind | null;
  a: PoolSide;
  b: PoolSide;
  /** Null for an Aquarius pool with no recent trade to read it from. */
  feeBp: number | null;
  /** B per A at the pool's own price. */
  price: number | null;
  /** Pool shares and the accounts holding them, classic pools only. */
  shares: number | null;
  accounts: number | null;
  tvlUsd: number | null;
  tvlXlm: number | null;
  /** The asset the pool was valued by. */
  valuedBy: string | null;
  volume24hUsd: number | null;
  fees24hUsd: number | null;
  trades24h: number;
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

export interface ProtocolActivity extends PoolActivity {
  /** The pool it happened in. */
  pool: { id: string; a: AssetIdentity; b: AssetIdentity };
}

export interface PoolDetail extends PoolSummary {
  /** Trade volume in USD per UTC day, valued at today's prices. */
  daily: Array<{ date: number; volume: number }>;
  activity: PoolActivity[];
}

/** A pool id from the URL: the hex id or the L address of a classic pool, the C address of a Soroban one. */
export function poolIdOf(param: string): string | null {
  const value = decodeURIComponent(param).trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
  if (StrKey.isValidLiquidityPool(value)) return StrKey.decodeLiquidityPool(value).toString("hex");
  if (StrKey.isValidContract(value)) return value;
  return null;
}

const addressOf = (id: string) => StrKey.encodeLiquidityPool(Buffer.from(id, "hex"));

// Soroban tokens are read as 7 decimals, like every classic asset
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
    protocol: "classic",
    kind: "constant_product",
    a,
    b,
    feeBp: Number(pool.fee_bp),
    price: a.amount > 0 ? b.amount / a.amount : null,
    shares: units(pool.total_shares),
    accounts: Number(pool.trustlines),
    tvlUsd: value?.usd ?? null,
    tvlXlm: value?.xlm ?? null,
    valuedBy: value?.by ?? null,
    volume24hUsd: null,
    fees24hUsd: null,
    trades24h: 0,
  };
}

/** What we know of a Soroban pool from its events, cached for the hour. */
interface SorobanPoolInfo {
  id: string;
  protocol: SorobanProtocol;
  kind: PoolKind | null;
  /** Token contracts in the pool's own order. */
  tokens: [string, string];
  /** Asset key of each, or the token contract when it isn't a classic asset. */
  keys: [string, string];
  feeBp: number | null;
  /** B per A from a stable pool's latest trade; other kinds have better sources. */
  tradePrice: number | null;
  /** Latest reserves and pool state events at the time. */
  reserves: string;
  state: string;
  /** Daily copy of what it holds, asset key to base units. */
  balances: Record<string, string>;
}

const SOROBAN_WINDOW = DAYS * LEDGERS_PER_DAY;

// the two tokens a Soroswap pair moves most; anyone can send it others
function pairTokens(rows: Array<{ contract_id: string; n: number | string }>): string[] {
  return [...rows].sort((x, y) => Number(y.n) - Number(x.n)).slice(0, 2).map((r) => r.contract_id);
}

async function loadSorobanInfo(ids: string[]): Promise<SorobanPoolInfo[]> {
  const pools = await indexedSorobanPools(ids, SOROBAN_WINDOW);
  if (!pools.length) return [];
  const pairs = pools.filter((p) => Number(p.soroswap)).map((p) => p.contract_id);
  const aquarius = pools.filter((p) => !Number(p.soroswap) && !Number(p.concentrated)).map((p) => p.contract_id);
  const [moved, balances, recent] = await Promise.all([
    indexedContractTokens(pairs, SOROBAN_WINDOW),
    indexedContractBalances(pools.map((p) => p.contract_id)),
    indexedAquariusEvents(aquarius, SOROBAN_WINDOW, AQUARIUS_EVENTS),
  ]);
  const tokensOf = new Map<string, string[]>();
  for (const pool of pools) {
    const tokens = Number(pool.soroswap)
      ? pairTokens(moved.filter((m) => m.account === pool.contract_id))
      : pool.tokens.map(topicAddress).filter((t): t is string => t !== null);
    if (tokens.length === 2) tokensOf.set(pool.contract_id, sortTokens(tokens));
  }
  const assets = new Map(
    (await indexedAssetContracts([...new Set([...tokensOf.values()].flat())])).map((r) => [r.contract_id, r.asset]),
  );
  const held = new Map(balances.map((b) => [b.holder, Object.fromEntries(b.balances)]));
  return pools.flatMap((pool): SorobanPoolInfo[] => {
    const tokens = tokensOf.get(pool.contract_id) as [string, string] | undefined;
    if (!tokens) return [];
    const base = {
      id: pool.contract_id,
      tokens,
      keys: tokens.map((t) => assets.get(t) ?? t) as [string, string],
      tradePrice: null,
      reserves: pool.reserves,
      state: pool.state,
      balances: held.get(pool.contract_id) ?? {},
    };
    if (Number(pool.soroswap)) {
      return [{ ...base, protocol: "soroswap", kind: "constant_product", feeBp: SOROSWAP_FEE_BP }];
    }
    // a concentrated pool's trade event carries its whole fee
    if (Number(pool.concentrated)) {
      return [{ ...base, protocol: "aquarius", kind: "concentrated", feeBp: feeBpOf(Number(pool.fee_ratio)) }];
    }
    const read = aquariusPool(
      recent.filter((e) => e.contract_id === pool.contract_id),
      tokens,
    );
    return [
      {
        ...base,
        protocol: "aquarius",
        kind: read?.kind ?? null,
        feeBp: read?.feeBp ?? null,
        tradePrice: read?.kind === "stable" ? read.price : null,
      },
    ];
  });
}

function summarizeSoroban(
  book: PriceBook,
  info: SorobanPoolInfo,
  live?: { reserves: string; state: string },
): PoolSummary | null {
  const reserves = reservesOf(live?.reserves || info.reserves);
  if (!reserves) return null;
  const a = side(book, info.keys[0], reserves[0]);
  const b = side(book, info.keys[1], reserves[1]);
  // only a constant product pool's reserves are its price
  const price =
    info.kind === "concentrated"
      ? tickPrice(live?.state || info.state)
      : info.kind === "stable"
        ? info.tradePrice
        : a.amount > 0
          ? b.amount / a.amount
          : null;
  const sides = [
    { asset: a.key, amount: a.amount },
    { asset: b.key, amount: b.amount },
  ] as const;
  let value =
    info.kind === "concentrated" || info.kind === "stable"
      ? price === null
        ? null
        : valueByHoldings(book, ...sides, price)
      : valueBySide(book, ...sides);
  // events are the contract's own word: the side it's valued by has to be
  // held for real, give or take a day of deposits since the daily copy
  const by = value && [a, b].find((s) => s.key === value!.by);
  if (by && Number(info.balances[by.key] ?? 0) * 2 < Number(reserves[by === a ? 0 : 1])) value = null;
  return {
    id: info.id,
    address: info.id,
    protocol: info.protocol,
    kind: info.kind,
    a,
    b,
    feeBp: info.feeBp,
    price,
    shares: null,
    accounts: null,
    tvlUsd: value?.usd ?? null,
    tvlXlm: value?.xlm ?? null,
    valuedBy: value?.by ?? null,
    volume24hUsd: null,
    fees24hUsd: null,
    trades24h: 0,
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
  const volume = values.some((v) => v !== null) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
  return {
    ...pool,
    volume24hUsd: volume,
    fees24hUsd: volume === null || pool.feeBp === null ? null : (volume * pool.feeBp) / 10_000,
    trades24h: mine.reduce((s, r) => s + Number(r.trades), 0),
  };
}

const tokensByPool = (infos: SorobanPoolInfo[]) => Object.fromEntries(infos.map((i) => [i.id, i.tokens]));

// throws on indexer errors so unstable_cache keeps only good results
async function loadSorobanList(): Promise<SorobanPoolInfo[]> {
  const book = buildPriceBook(await indexedPricePools());
  return loadSorobanInfo(await indexedSorobanCandidates(anchorAssets(book), SOROBAN_CANDIDATES));
}

// which contracts are pools barely changes; their reserves are read live
const cachedSorobanList = unstable_cache(loadSorobanList, ["soroban-pools"], { revalidate: 3600 });

async function liveSorobanPools(book: PriceBook): Promise<{ pools: PoolSummary[]; infos: SorobanPoolInfo[] }> {
  const infos = await cachedSorobanList();
  const live = new Map(
    (await indexedSorobanReserves(infos.map((i) => i.id), LEDGERS_PER_DAY)).map((r) => [r.contract_id, r]),
  );
  const pools = infos
    .map((info) => summarizeSoroban(book, info, live.get(info.id)))
    .filter((pool): pool is PoolSummary => pool !== null);
  return { pools, infos };
}

/** One protocol's pools we can value, added up. */
export interface ProtocolTotals {
  protocol: PoolProtocol;
  pools: number;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  trades24h: number;
}

function totalsOf(pools: PoolSummary[], protocols: PoolProtocol[]): ProtocolTotals[] {
  return protocols.map((protocol) => {
    const mine = pools.filter((p) => p.protocol === protocol);
    const sum = (value: (p: PoolSummary) => number | null) => mine.reduce((s, p) => s + (value(p) ?? 0), 0);
    return {
      protocol,
      pools: mine.length,
      tvlUsd: sum((p) => p.tvlUsd),
      volume24hUsd: sum((p) => p.volume24hUsd),
      fees24hUsd: sum((p) => p.fees24hUsd),
      trades24h: sum((p) => p.trades24h),
    };
  });
}

async function loadPools(): Promise<{ top: PoolSummary[]; totals: ProtocolTotals[] }> {
  const book = buildPriceBook(await indexedPricePools());
  const ids = await indexedPoolCandidates(anchorAssets(book), CLASSIC_POOLS);
  const [classic, soroban] = await Promise.all([
    indexedLivePools(ids).then((rows) => rows.map((pool) => summarize(book, pool))),
    // a Soroban outage shouldn't take the classic pools down with it
    liveSorobanPools(book).catch((error) => {
      console.warn("[indexer] soroban pools: failed", error instanceof Error ? error.message : error);
      return null;
    }),
  ]);
  const valued = [...classic, ...(soroban?.pools ?? [])]
    .filter((pool) => pool.tvlXlm !== null)
    .sort((x, y) => y.tvlXlm! - x.tvlXlm!);
  const isSoroban = (p: PoolSummary) => p.protocol !== "classic";
  const priced = new Set(valued.filter(isSoroban).map((p) => p.id));
  const [classicTrades, sorobanTrades] = await Promise.all([
    indexedPoolTrades(
      valued.filter((p) => !isSoroban(p)).map((p) => p.address),
      LEDGERS_PER_DAY,
    ),
    indexedPoolTrades(
      [...priced],
      LEDGERS_PER_DAY,
      tokensByPool((soroban?.infos ?? []).filter((i) => priced.has(i.id))),
    ),
  ]);
  const pools = valued.map((pool) => withVolume(book, pool, isSoroban(pool) ? sorobanTrades : classicTrades));
  return {
    top: pools.slice(0, TOP_POOLS),
    // no Soroban totals at all beats totals of zero
    totals: totalsOf(pools, soroban ? ["classic", "aquarius", "soroswap"] : ["classic"]),
  };
}

const cachedPools = unstable_cache(loadPools, ["pools"], { revalidate: 120 });

/** The most valuable pools, classic and Soroban, live. Indexer only: null on testnet or when it failed. */
export function getTopPools(): Promise<PoolSummary[] | null> {
  return indexerRead("top pools", async () => (await cachedPools()).top);
}

/**
 * Value locked and 24h trading per protocol, from every pool we can value.
 * Mainnet facts shown on every network; null when the indexer is off or failed.
 */
export function getProtocolTotals(): Promise<ProtocolTotals[] | null> {
  return withIndexer<ProtocolTotals[] | null>(
    "protocol totals",
    async () => (await cachedPools()).totals,
    async () => null,
    { anyNetwork: true },
  );
}

type ChPoolOp = Awaited<ReturnType<typeof indexedPoolActivity>>[number];

function activityOf(op: ChPoolOp): PoolActivity | null {
  // each asset's net flow: a swap that refunds part of what was sent, or two
  // swaps the same way, read as one
  const net = new Map<string, bigint>();
  for (const [key, raw] of op.legs) net.set(key, (net.get(key) ?? 0n) + BigInt(raw));
  const legs = [...net]
    .filter(([, amount]) => amount !== 0n)
    .map(([key, amount]) => ({ key, into: amount > 0n, amount: amount > 0n ? amount : -amount }));
  const ins = legs.filter((l) => l.into).length;
  const outs = legs.length - ins;
  // anything else, like a fee or reward claim, isn't trading or liquidity
  const kind: PoolActivityKind | null =
    ins === 1 && outs === 1 ? "trade" : ins === 2 && outs === 0 ? "deposit" : ins === 0 && outs === 2 ? "withdraw" : null;
  if (!kind) return null;
  return {
    kind,
    account: op.counterparty,
    txHash: op.tx_hash,
    createdAt: `${op.closed_at.replace(" ", "T")}Z`,
    // a trade reads "gave X for Y": what went in first
    legs: (kind === "trade" ? [...legs].sort((x, y) => Number(y.into) - Number(x.into)) : legs).map((l) => ({
      identity: identityOf(l.key),
      amount: stroopsToLumens(l.amount),
      into: l.into,
    })),
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

async function poolDetail(book: PriceBook, summary: PoolSummary, tokens?: string[]): Promise<PoolDetail> {
  const [trades, daily, activity] = await Promise.all([
    indexedPoolTrades([summary.address], LEDGERS_PER_DAY, tokens && { [summary.address]: tokens }),
    indexedPoolDailyTrades(summary.address, DAYS, tokens),
    indexedPoolActivity(summary.address, ACTIVITY, tokens),
  ]);
  return {
    ...withVolume(book, summary, trades),
    daily: dailyVolume(book, daily),
    activity: activity.map(activityOf).filter((a): a is PoolActivity => a !== null),
  };
}

/**
 * One pool, live: reserves, value, volume, daily volume and latest activity.
 * "missing" when there is no such pool, null when the indexer is off or failed.
 */
export const getPool = cache(
  (id: string): Promise<PoolDetail | "missing" | null> =>
    indexerRead(`pool ${id.slice(0, 8)}`, async () => {
      const book = buildPriceBook(await indexedPricePools());
      if (StrKey.isValidContract(id)) {
        if ((await indexedEventCount(id, SOROBAN_WINDOW)) > MAX_POOL_EVENTS) return "missing" as const;
        const [info] = await loadSorobanInfo([id]);
        const summary = info && summarizeSoroban(book, info);
        if (!summary) return "missing" as const;
        return poolDetail(book, summary, info.tokens);
      }
      const pool = await indexedPool(id);
      if (!pool) return "missing" as const;
      return poolDetail(book, summarize(book, pool));
    }),
);

// three days covers even a quiet protocol's latest few dozen operations
const PROTOCOL_ACTIVITY_LEDGERS = 3 * LEDGERS_PER_DAY;

/**
 * The latest trades, deposits and withdrawals across a Soroban protocol's
 * pools we track, and how many pools that is. Mainnet facts shown on every
 * network; null when the indexer is off or failed.
 */
export function getProtocolActivity(
  protocol: SorobanProtocol,
): Promise<{ pools: number; activity: ProtocolActivity[] } | null> {
  return withIndexer<{ pools: number; activity: ProtocolActivity[] } | null>(
    `${protocol} activity`,
    async () => {
      const infos = (await cachedSorobanList()).filter((i) => i.protocol === protocol);
      const byAddress = new Map(infos.map((i) => [i.id, i]));
      const ops = await indexedPoolsActivity(tokensByPool(infos), PROTOCOL_ACTIVITY_LEDGERS, ACTIVITY);
      const activity = ops.flatMap((op) => {
        const read = activityOf(op);
        const info = byAddress.get(op.pool);
        if (!read || !info) return [];
        return [{ ...read, pool: { id: info.id, a: identityOf(info.keys[0]), b: identityOf(info.keys[1]) } }];
      });
      return { pools: infos.length, activity };
    },
    async () => null,
    { anyNetwork: true },
  );
}
