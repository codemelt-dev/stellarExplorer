import "server-only";
import { chQuery } from "./client";

// Soroban AMM pools: Soroswap pairs and Aquarius pools. They are plain
// contracts, so they are found by what they hold (SAC balances in the daily
// copy) and recognised by the events they emit. Reserves come from those
// events: Soroswap's sync, Aquarius' update_reserves and, for concentrated
// pools, pool_state with the current tick

const SOROSWAP = `topics[1] = '{"string":"SoroswapPair"}'`;
const SYNC = `(${SOROSWAP} AND topics[2] = '{"symbol":"sync"}')`;
const UPDATE_RESERVES = `topics[1] = '{"symbol":"update_reserves"}'`;
const POOL_STATE = `topics[1] = '{"symbol":"pool_state"}'`;
const TRADE = `topics[1] = '{"symbol":"trade"}'`;
const LIQUIDITY = `topics[1] IN ('{"symbol":"deposit_liquidity"}', '{"symbol":"withdraw_liquidity"}')`;
const LATEST = "(ledger_sequence, tx_index, event_index)";
// a trade big enough that its fee isn't rounded away
const AMOUNT_IN = `toFloat64OrZero(JSONExtractString(data, 'vec', 1, 'i128'))`;
const FEE = `toFloat64OrZero(JSONExtractString(data, 'vec', 3, 'i128'))`;

const CONTRACT = /^C[A-Z2-7]{55}$/;

const list = (xs: Array<string | number>) =>
  `[${xs.map((x) => (typeof x === "string" ? `'${x}'` : String(x))).join(",")}]`;

/**
 * Contracts by what they hold of trusted assets in the latest daily copy, the
 * shortlist pools are picked from. Most are pools; lending markets, vaults
 * and bridges drop out when they don't emit pool events.
 */
export async function indexedSorobanCandidates(
  prices: Array<{ asset: string; xlm: number }>,
  limit: number,
): Promise<string[]> {
  if (!prices.length) return [];
  const rows = await chQuery<{ holder: string }>(
    `SELECT holder FROM state_sac_balances
     WHERE asset IN {assets:Array(String)} AND startsWith(holder, 'C')
     GROUP BY holder
     ORDER BY max(toFloat64(balance) * transform(asset, {assets:Array(String)}, {prices:Array(Float64)}, 0.)) DESC
     LIMIT {limit:UInt32}`,
    { assets: list(prices.map((p) => p.asset)), prices: list(prices.map((p) => p.xlm)), limit },
  );
  return rows.map((r) => r.holder);
}

/**
 * How many events a contract emitted over the last `ledgers` ledgers. One
 * contract at a time: a plain count is read off the index, grouping by
 * contract would read every row.
 */
export async function indexedEventCount(id: string, ledgers: number): Promise<number> {
  if (!CONTRACT.test(id)) return 0;
  const [row] = await chQuery<{ events: string | number }>(
    `WITH (SELECT max(sequence) FROM ledgers) AS tip
     SELECT count() AS events FROM events
     WHERE contract_id = {id:String} AND ledger_sequence > tip - {ledgers:UInt32}`,
    { id, ledgers },
  );
  return Number(row?.events ?? 0);
}

export interface ChSorobanPool {
  contract_id: string;
  soroswap: number;
  concentrated: number;
  /** Token contracts seen in Aquarius trades and liquidity events. */
  tokens: string[];
  /** Latest reserves event data, "" when there was none in the window. */
  reserves: string;
  /** Latest pool_state data of a concentrated pool. */
  state: string;
  /** fee / amount in of the latest sizeable Aquarius trade, 0 when none. */
  fee_ratio: number;
}

/**
 * Which of the given contracts are Soroswap or Aquarius pools, with what
 * their events say about them over the last `ledgers` ledgers.
 */
export async function indexedSorobanPools(ids: string[], ledgers: number): Promise<ChSorobanPool[]> {
  const valid = ids.filter((id) => CONTRACT.test(id));
  if (!valid.length) return [];
  return chQuery<ChSorobanPool>(
    `WITH (SELECT max(sequence) FROM ledgers) AS tip
     SELECT contract_id,
            max(${SOROSWAP}) AS soroswap,
            max(${POOL_STATE}) AS concentrated,
            arrayDistinct(arrayConcat(
              groupUniqArrayIf(topics[2], ${TRADE} OR ${LIQUIDITY}),
              groupUniqArrayIf(topics[3], ${TRADE} OR ${LIQUIDITY}))) AS tokens,
            argMaxIf(data, ${LATEST}, ${UPDATE_RESERVES} OR ${SYNC}) AS reserves,
            argMaxIf(data, ${LATEST}, ${POOL_STATE}) AS state,
            argMaxIf(${FEE} / ${AMOUNT_IN}, ${LATEST}, ${TRADE} AND ${AMOUNT_IN} >= 1e6) AS fee_ratio
     FROM events
     WHERE contract_id IN {ids:Array(String)} AND ledger_sequence > tip - {ledgers:UInt32}
       AND (${SOROSWAP} OR ${UPDATE_RESERVES} OR ${POOL_STATE} OR ${TRADE} OR ${LIQUIDITY})
     GROUP BY contract_id
     HAVING soroswap OR countIf(${UPDATE_RESERVES}) > 0`,
    { ids: list(valid), ledgers },
  );
}

/** The latest trade and update_reserves events of each Aquarius pool, newest first. */
export async function indexedAquariusEvents(
  ids: string[],
  ledgers: number,
  perPool: number,
): Promise<Array<{ contract_id: string; trade: number; token_in: string; data: string }>> {
  const valid = ids.filter((id) => CONTRACT.test(id));
  if (!valid.length) return [];
  return chQuery(
    `WITH (SELECT max(sequence) FROM ledgers) AS tip
     SELECT contract_id, ${TRADE} AS trade, topics[2] AS token_in, data
     FROM events
     WHERE contract_id IN {ids:Array(String)} AND ledger_sequence > tip - {ledgers:UInt32}
       AND (${TRADE} OR ${UPDATE_RESERVES})
     ORDER BY contract_id, ledger_sequence DESC, tx_index DESC, event_index DESC
     LIMIT {perPool:UInt32} BY contract_id`,
    { ids: list(valid), ledgers, perPool },
  );
}

export interface ChPoolReserves {
  contract_id: string;
  reserves: string;
  state: string;
}

/** The latest reserves (and pool state) of the given pools over the last `ledgers` ledgers. */
export async function indexedSorobanReserves(ids: string[], ledgers: number): Promise<ChPoolReserves[]> {
  const valid = ids.filter((id) => CONTRACT.test(id));
  if (!valid.length) return [];
  return chQuery<ChPoolReserves>(
    `WITH (SELECT max(sequence) FROM ledgers) AS tip
     SELECT contract_id,
            argMaxIf(data, ${LATEST}, ${UPDATE_RESERVES} OR ${SYNC}) AS reserves,
            argMaxIf(data, ${LATEST}, ${POOL_STATE}) AS state
     FROM events
     WHERE contract_id IN {ids:Array(String)} AND ledger_sequence > tip - {ledgers:UInt32}
       AND (${UPDATE_RESERVES} OR ${SYNC} OR ${POOL_STATE})
     GROUP BY contract_id`,
    { ids: list(valid), ledgers },
  );
}

/** Each pool's last reserves and pool state in the 30 days before `day`. */
export async function indexedSorobanReservesBefore(ids: string[], day: string): Promise<ChPoolReserves[]> {
  const valid = ids.filter((id) => CONTRACT.test(id));
  if (!valid.length) return [];
  return chQuery<ChPoolReserves>(
    `SELECT contract_id,
            argMaxIf(data, ${LATEST}, ${UPDATE_RESERVES} OR ${SYNC}) AS reserves,
            argMaxIf(data, ${LATEST}, ${POOL_STATE}) AS state
     FROM events
     WHERE contract_id IN {ids:Array(String)}
       AND closed_at >= {day:Date} - 30 AND closed_at < {day:Date}
       AND (${UPDATE_RESERVES} OR ${SYNC} OR ${POOL_STATE})
     GROUP BY contract_id`,
    { ids: list(valid), day },
  );
}

export interface ChPoolDayReserves extends ChPoolReserves {
  day: string;
}

/**
 * Each pool's last reserves and pool state of every UTC day from `since` on,
 * for the days it emitted them; either is empty on a day it didn't.
 */
export async function indexedSorobanDailyReserves(ids: string[], since: string): Promise<ChPoolDayReserves[]> {
  const valid = ids.filter((id) => CONTRACT.test(id));
  if (!valid.length) return [];
  return chQuery<ChPoolDayReserves>(
    `SELECT contract_id, toString(toDate(closed_at)) AS day,
            argMaxIf(data, ${LATEST}, ${UPDATE_RESERVES} OR ${SYNC}) AS reserves,
            argMaxIf(data, ${LATEST}, ${POOL_STATE}) AS state
     FROM events
     WHERE contract_id IN {ids:Array(String)} AND closed_at >= {since:Date}
       AND (${UPDATE_RESERVES} OR ${SYNC} OR ${POOL_STATE})
     GROUP BY contract_id, day`,
    { ids: list(valid), since },
  );
}

/**
 * The token contracts each contract moved over the last `ledgers` ledgers,
 * with how many transfers. A Soroswap pair's two tokens come from here; its
 * own share token is left out.
 */
export async function indexedContractTokens(
  ids: string[],
  ledgers: number,
): Promise<Array<{ account: string; contract_id: string; n: string | number }>> {
  const valid = ids.filter((id) => CONTRACT.test(id));
  if (!valid.length) return [];
  return chQuery(
    `WITH (SELECT max(sequence) FROM ledgers) AS tip
     SELECT account, contract_id, count() AS n
     FROM transfers_by_account
     WHERE account IN {ids:Array(String)} AND ledger_sequence > tip - {ledgers:UInt32}
       AND kind = 'transfer' AND contract_id != account
     GROUP BY account, contract_id`,
    { ids: list(valid), ledgers },
  );
}

/** Classic assets behind the given token contracts (their SACs). */
export async function indexedAssetContracts(ids: string[]): Promise<Array<{ contract_id: string; asset: string }>> {
  const valid = ids.filter((id) => CONTRACT.test(id));
  if (!valid.length) return [];
  return chQuery(
    `SELECT contract_id, asset FROM state_asset_contracts WHERE contract_id IN {ids:Array(String)}`,
    { ids: list(valid) },
  );
}

/** What each contract holds of classic assets in the latest daily copy, in base units. */
export async function indexedContractBalances(
  ids: string[],
): Promise<Array<{ holder: string; balances: Array<[string, string]> }>> {
  const valid = ids.filter((id) => CONTRACT.test(id));
  if (!valid.length) return [];
  return chQuery(
    `SELECT holder, groupArray((asset, toString(balance))) AS balances
     FROM state_sac_balances WHERE holder IN {ids:Array(String)} GROUP BY holder`,
    { ids: list(valid) },
  );
}
