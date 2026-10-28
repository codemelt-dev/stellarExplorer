import "server-only";
import { apiGet, chQuery } from "./client";

// Classic AMM pools. Current state comes live from the API; the ranking reads
// the daily copy in ClickHouse, and trades come from the pool's transfers:
// in one operation a trade moves one asset into the pool and another out,
// a deposit moves both in, a withdrawal both out

export interface ChPool {
  pool_id: string;
  asset_a: string;
  asset_b: string;
  fee_bp: number;
  reserve_a: string;
  reserve_b: string;
  total_shares: string;
  trustlines: number;
  last_modified_ledger: number;
}

const POOL_COLUMNS =
  "pool_id,asset_a,asset_b,fee_bp,reserve_a,reserve_b,total_shares,trustlines,last_modified_ledger";
const HEX64 = /^[0-9a-f]{64}$/;
// pool ids per request, keeps the URL short
const BATCH = 40;

const list = (xs: Array<string | number>) =>
  `[${xs.map((x) => (typeof x === "string" ? `'${x}'` : String(x))).join(",")}]`;

/**
 * Pool ids by value in the latest daily copy, each valued by the side with a
 * known XLM price. Only a shortlist: the live state decides the final order.
 */
export async function indexedPoolCandidates(
  prices: Array<{ asset: string; xlm: number }>,
  limit: number,
): Promise<string[]> {
  if (!prices.length) return [];
  const rows = await chQuery<{ pool_id: string }>(
    `SELECT pool_id FROM (
       SELECT pool_id, greatest(
         reserve_a * transform(asset_a, {assets:Array(String)}, {prices:Array(Float64)}, 0.),
         reserve_b * transform(asset_b, {assets:Array(String)}, {prices:Array(Float64)}, 0.)) AS value
       FROM state_liquidity_pools)
     WHERE value > 0 ORDER BY value DESC LIMIT {limit:UInt32}`,
    {
      // asset keys are CODE:ISSUER or native, from our own price book
      assets: list(prices.map((p) => p.asset)),
      prices: list(prices.map((p) => p.xlm)),
      limit,
    },
  );
  return rows.map((r) => r.pool_id);
}

/** Live state of the given pools, in no particular order. */
export async function indexedLivePools(ids: string[]): Promise<ChPool[]> {
  const valid = ids.filter((id) => HEX64.test(id));
  const batches: string[][] = [];
  for (let i = 0; i < valid.length; i += BATCH) batches.push(valid.slice(i, i + BATCH));
  const rows = await Promise.all(
    batches.map((batch) =>
      apiGet<ChPool>("liquidity_pools", { select: POOL_COLUMNS, pool_id: `in.(${batch.join(",")})` }),
    ),
  );
  return rows.flat();
}

export async function indexedPool(id: string): Promise<ChPool | null> {
  if (!HEX64.test(id)) return null;
  const [row] = await apiGet<ChPool>("liquidity_pools", { select: POOL_COLUMNS, pool_id: `eq.${id}` });
  return row ?? null;
}

export interface ChPoolTrades {
  /** The pool's L address. */
  pool: string;
  asset_in: string;
  asset_out: string;
  /** Base units into and out of the pool, as digit strings. */
  amount_in: string;
  amount_out: string;
  trades: string | number;
}

// one row per operation that touched the pool, with what went in and out
const POOL_OPS = `
  SELECT account, ledger_sequence, tx_index, op_index, any(closed_at) AS op_time,
         countIf(amount > 0) AS ins, countIf(amount < 0) AS outs,
         anyIf(asset, amount > 0) AS asset_in, anyIf(asset, amount < 0) AS asset_out,
         sumIf(amount, amount > 0) AS amount_in, -sumIf(amount, amount < 0) AS amount_out
  FROM transfers_by_account
  WHERE account IN {pools:Array(String)} AND kind = 'transfer' AND %WINDOW%
  GROUP BY account, ledger_sequence, tx_index, op_index`;

/** Trades through each pool over the last `ledgers` ledgers, by direction. */
export async function indexedPoolTrades(pools: string[], ledgers: number): Promise<ChPoolTrades[]> {
  if (!pools.length) return [];
  return chQuery<ChPoolTrades>(
    `SELECT account AS pool, asset_in, asset_out, toString(sum(amount_in)) AS amount_in,
            toString(sum(amount_out)) AS amount_out, count() AS trades
     FROM (${POOL_OPS.replace("%WINDOW%", "ledger_sequence > (SELECT max(sequence) FROM ledgers) - {ledgers:UInt32}")})
     WHERE ins > 0 AND outs > 0
     GROUP BY pool, asset_in, asset_out`,
    { pools: list(pools), ledgers },
  );
}

export interface ChPoolDay extends Omit<ChPoolTrades, "pool"> {
  day: string;
}

/** A pool's trades per UTC day for the last `days` days, by direction. */
export async function indexedPoolDailyTrades(pool: string, days: number): Promise<ChPoolDay[]> {
  return chQuery<ChPoolDay>(
    `SELECT toString(toDate(op_time)) AS day, asset_in, asset_out,
            toString(sum(amount_in)) AS amount_in, toString(sum(amount_out)) AS amount_out, count() AS trades
     FROM (${POOL_OPS.replace("%WINDOW%", "closed_at >= today() - {days:UInt32}")})
     WHERE ins > 0 AND outs > 0
     GROUP BY day, asset_in, asset_out ORDER BY day`,
    { pools: list([pool]), days },
  );
}

export interface ChPoolOp {
  ledger_sequence: number;
  tx_index: number;
  op_index: number;
  closed_at: string;
  counterparty: string;
  /** [asset, base units] per transfer; positive went into the pool. */
  legs: Array<[string, string]>;
  tx_hash: string;
}

/** The pool's latest operations: trades, deposits and withdrawals, newest first. */
export async function indexedPoolActivity(pool: string, limit: number): Promise<ChPoolOp[]> {
  // aliases can't reuse column names: ClickHouse would read them in WHERE too
  const rows = await chQuery<{
    ledger_sequence: number;
    tx_index: number;
    op_index: number;
    op_time: string;
    op_counterparty: string;
    legs: Array<[string, string]>;
  }>(
    `SELECT ledger_sequence, tx_index, op_index, any(closed_at) AS op_time,
            any(counterparty) AS op_counterparty, groupArray((asset, toString(amount))) AS legs
     FROM transfers_by_account
     WHERE account = {pool:String} AND kind = 'transfer'
       -- the last few hundred transfers are enough, read in key order
       AND ledger_sequence >= ifNull((
         SELECT ledger_sequence FROM transfers_by_account WHERE account = {pool:String}
         ORDER BY ledger_sequence DESC LIMIT 1 OFFSET {scan:UInt32}), 0)
     GROUP BY ledger_sequence, tx_index, op_index
     ORDER BY ledger_sequence DESC, tx_index DESC, op_index DESC LIMIT {limit:UInt32}`,
    { pool, limit, scan: limit * 4 },
  );
  const ops = rows.map(({ op_time, op_counterparty, ...r }) => ({
    ...r,
    closed_at: op_time,
    counterparty: op_counterparty,
  }));
  if (!ops.length) return [];
  const hashes = await chQuery<{ ledger_sequence: number; tx_index: number; tx_hash: string }>(
    `SELECT ledger_sequence, tx_index, lower(hex(hash)) AS tx_hash FROM transactions
     WHERE ledger_sequence IN {ledgers:Array(UInt32)} AND (ledger_sequence, tx_index) IN {txs:Array(Tuple(UInt32, UInt32))}`,
    {
      ledgers: list([...new Set(ops.map((o) => Number(o.ledger_sequence)))]),
      txs: `[${ops.map((o) => `(${Number(o.ledger_sequence)},${Number(o.tx_index)})`).join(",")}]`,
    },
  );
  const byTx = new Map(hashes.map((h) => [`${h.ledger_sequence}-${h.tx_index}`, h.tx_hash]));
  return ops.map((o) => ({ ...o, tx_hash: byTx.get(`${o.ledger_sequence}-${o.tx_index}`) ?? "" }));
}
