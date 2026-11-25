import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { Address, contract, xdr } from "@stellar/stellar-sdk";
import { apiGet, chQuery } from "./client";
import {
  fromScJson,
  instanceSummary,
  specFunctions,
  type ContractFunction,
  type ContractSummary,
} from "../contractDecode";
import type {
  ContractCall,
  ContractCreation,
  ContractEventsPage,
  ContractStorageEntry,
  ContractStoragePage,
} from "../contracts";

// the API sends binary as base64; plain Postgres would send \x-prefixed hex
function bytes(value: string): Buffer {
  return value.startsWith("\\x")
    ? Buffer.from(value.slice(2), "hex")
    : Buffer.from(value, "base64");
}

// contract_data rows are keyed by sha256 of the ledger key XDR, so the
// instance entry of a contract can be fetched directly
function instanceKeyHash(contractId: string): string {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
  return createHash("sha256").update(key.toXDR()).digest("hex");
}

interface ApiInstance {
  val_xdr: string;
  live_until_ledger: number | null;
  last_modified_ledger: number | null;
}

/** Contract instance from current state. Null when the contract isn't there. */
export const indexedContractSummary = cache(
  async (contractId: string): Promise<ContractSummary | null> => {
    const [row] = await apiGet<ApiInstance>("contract_data", {
      key_hash: `eq.${instanceKeyHash(contractId)}`,
      select: "val_xdr,live_until_ledger,last_modified_ledger",
    });
    if (!row) return null;
    const instance = xdr.ScVal.fromXDR(bytes(row.val_xdr)).instance();
    return instanceSummary(
      contractId,
      instance,
      row.last_modified_ledger === null ? null : Number(row.last_modified_ledger),
      row.live_until_ledger === null ? null : Number(row.live_until_ledger),
    );
  },
);

/** The contract's compiled code. Null for asset contracts or when the code isn't stored. */
export const indexedContractWasm = cache(
  async (contractId: string): Promise<{ hash: string; wasm: Buffer } | null> => {
    const summary = await indexedContractSummary(contractId);
    if (summary?.executable.kind !== "wasm") return null;
    const hash = summary.executable.wasmHash;
    const [row] = await apiGet<{ wasm: string }>("contract_wasm", {
      code_hash: `eq.${hash}`,
      select: "wasm",
    });
    return row ? { hash, wasm: bytes(row.wasm) } : null;
  },
);

/** Function signatures parsed from the stored Wasm. Null for asset contracts or missing code. */
export async function indexedContractInterface(
  contractId: string,
): Promise<ContractFunction[] | null> {
  const code = await indexedContractWasm(contractId);
  return code ? specFunctions(contract.Spec.fromWasm(code.wasm)) : null;
}

interface ApiEntry {
  key_hash: string;
  durability: string;
  key: unknown;
  val: unknown;
  live_until_ledger: number | null;
  expired: boolean | null;
}

// one request's worth (the API caps at 200); the page splits it up in the browser
const STORAGE_PAGE = 200;

/**
 * A contract's persistent and temporary entries, in key hash order (the only
 * order the store pages by). `after` is the last key hash already shown.
 */
export async function indexedContractStorage(
  contractId: string,
  after?: string,
): Promise<ContractStoragePage> {
  const rows = await apiGet<ApiEntry>("contract_data", {
    contract_id: `eq.${contractId}`,
    select: "key_hash,durability,key,val,live_until_ledger,expired",
    order: "key_hash",
    limit: String(STORAGE_PAGE),
    ...(after ? { key_hash: `gt.${after}` } : {}),
  });
  // the instance entry lives in the same table and has its own section
  const instance = instanceKeyHash(contractId);
  const entries: ContractStorageEntry[] = rows
    .filter((row) => row.key_hash !== instance)
    .map((row) => ({
      keyHash: row.key_hash,
      durability: row.durability === "temporary" ? "temporary" : "persistent",
      key: fromScJson(row.key),
      value: fromScJson(row.val),
      liveUntilLedger: row.live_until_ledger === null ? null : Number(row.live_until_ledger),
      expired: Boolean(row.expired),
    }));
  return {
    entries,
    next: rows.length === STORAGE_PAGE ? rows[rows.length - 1].key_hash : null,
  };
}

interface ChEvent {
  ledger_sequence: number;
  tx_index: number;
  op_index: number;
  event_index: number;
  closed_ts: number;
  topics: unknown;
  data: unknown;
  tx_hash: string;
}

function parse(json: unknown): unknown {
  if (typeof json !== "string") return json;
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

// one batch; a query reads whole granules, so 10 rows cost the same as 100
const EVENTS_PAGE = 100;
const MAX_UINT32 = 0xffffffff;
const MAX_INT32 = 0x7fffffff;

// an event's place in the table: "ledger-tx-op-event"
function eventCursor(e: ChEvent): string {
  return `${e.ledger_sequence}-${e.tx_index}-${e.op_index}-${e.event_index}`;
}

function parseEventCursor(cursor: string): { l: number; t: number; o: number; e: number } | null {
  const m = /^(\d+)-(\d+)-(\d+)-(\d+)$/.exec(cursor);
  if (!m) return null;
  const [l, t, o, e] = m.slice(1).map(Number);
  return [l, t, o, e].every((n) => n <= MAX_UINT32) ? { l, t, o, e } : null;
}

/**
 * A contract's events, newest first, 100 at a time; `before` is the cursor of
 * the last one already shown. The table is sorted by contract, then position.
 * ClickHouse can't seek on the position tuple, so an inner query finds the
 * ledger the page reaches back to and the page reads only from there. Fee
 * events (op_index -1) are left out. Null for a malformed cursor.
 */
export async function indexedContractEvents(
  contractId: string,
  before?: string,
): Promise<ContractEventsPage | null> {
  const at = before ? parseEventCursor(before) : null;
  if (before && !at) return null;
  const rows = await chQuery<ChEvent>(
    `WITH page AS (
       SELECT ledger_sequence, tx_index, op_index, event_index,
              toUnixTimestamp(closed_at) AS closed_ts, topics, data
       FROM events
       WHERE contract_id = {contract:String} AND op_index >= 0 AND ledger_sequence <= {l:UInt32}
         AND ledger_sequence >= (SELECT ifNull(minOrNull(ledger_sequence), {max:UInt32}) FROM (
               SELECT ledger_sequence FROM events
               WHERE contract_id = {contract:String} AND op_index >= 0 AND ledger_sequence < {l:UInt32}
               ORDER BY contract_id DESC, ledger_sequence DESC LIMIT {limit:UInt32}))
         AND (ledger_sequence, tx_index, op_index, event_index) < ({l:UInt32}, {t:UInt32}, {o:Int32}, {e:UInt32})
       ORDER BY contract_id DESC, ledger_sequence DESC, tx_index DESC, op_index DESC, event_index DESC
       LIMIT {limit:UInt32})
     SELECT p.ledger_sequence AS ledger_sequence, p.tx_index AS tx_index, p.op_index AS op_index,
            p.event_index AS event_index, p.closed_ts AS closed_ts,
            p.topics AS topics, p.data AS data, lower(hex(t.hash)) AS tx_hash
     FROM page AS p
     LEFT JOIN (SELECT ledger_sequence, tx_index, hash FROM transactions
                WHERE ledger_sequence >= (SELECT ifNull(minOrNull(ledger_sequence), {max:UInt32}) FROM page)
                  AND ledger_sequence <= {l:UInt32}
                  AND (ledger_sequence, tx_index) IN (SELECT ledger_sequence, tx_index FROM page)) AS t
            USING (ledger_sequence, tx_index)
     ORDER BY p.ledger_sequence DESC, p.tx_index DESC, p.op_index DESC, p.event_index DESC`,
    {
      contract: contractId,
      limit: EVENTS_PAGE,
      max: MAX_UINT32,
      ...(at ?? { l: MAX_UINT32, t: MAX_UINT32, o: MAX_INT32, e: MAX_UINT32 }),
    },
  );
  return {
    events: rows.map((e) => ({
      txHash: e.tx_hash,
      ledger: Number(e.ledger_sequence),
      createdAt: new Date(Number(e.closed_ts) * 1000).toISOString(),
      topics: (Array.isArray(e.topics) ? e.topics : []).map((t) => fromScJson(parse(t))),
      data: fromScJson(parse(e.data)),
    })),
    next: rows.length === EVENTS_PAGE ? eventCursor(rows[rows.length - 1]) : null,
  };
}

interface ChCall {
  ledger_sequence: number;
  closed_ts: number;
  function: string;
  caller: string;
  successful: boolean | number;
  tx_hash: string;
}

/**
 * A contract's newest calls with their transactions' hashes. The table is
 * sorted by contract, then position, so the newest rows read first.
 */
export async function indexedContractCalls(contractId: string, limit: number): Promise<ContractCall[]> {
  const rows = await chQuery<ChCall>(
    `WITH page AS (
       SELECT ledger_sequence, tx_index, op_index, toUnixTimestamp(closed_at) AS closed_ts,
              function, caller, successful
       FROM contract_calls
       WHERE contract_id = {contract:String}
       ORDER BY contract_id DESC, ledger_sequence DESC, tx_index DESC, op_index DESC
       LIMIT {limit:UInt32})
     SELECT p.ledger_sequence AS ledger_sequence, p.closed_ts AS closed_ts, p.function AS function,
            p.caller AS caller, p.successful AS successful, lower(hex(t.hash)) AS tx_hash
     FROM page AS p
     LEFT JOIN (SELECT ledger_sequence, tx_index, hash FROM transactions
                WHERE ledger_sequence >= (SELECT ifNull(minOrNull(ledger_sequence), {max:UInt32}) FROM page)
                  AND (ledger_sequence, tx_index) IN (SELECT ledger_sequence, tx_index FROM page)) AS t
            USING (ledger_sequence, tx_index)
     ORDER BY p.ledger_sequence DESC, p.tx_index DESC, p.op_index DESC`,
    { contract: contractId, limit, max: MAX_UINT32 },
  );
  return rows.map((c) => ({
    // a LEFT JOIN miss comes back as zeros, not null
    txHash: /^[0-9a-f]{64}$/.test(c.tx_hash) && !/^0+$/.test(c.tx_hash) ? c.tx_hash : null,
    ledger: Number(c.ledger_sequence),
    createdAt: new Date(Number(c.closed_ts) * 1000).toISOString(),
    fn: c.function,
    caller: c.caller,
    successful: Boolean(Number(c.successful)),
  }));
}

export interface IndexedContract {
  contract_id: string;
  wasm_hash: string | null;
  /** Asset key when this is a Stellar asset's contract. */
  asset: string | null;
}

const CONTRACT_COLUMNS = "contract_id,wasm_hash,asset";

/** Every contract in address order, the only order the store pages by. */
export async function indexedContracts(
  after: string | undefined,
  limit: number,
): Promise<IndexedContract[]> {
  return apiGet<IndexedContract>("contracts", {
    select: CONTRACT_COLUMNS,
    order: "contract_id",
    limit: String(limit),
    ...(after ? { contract_id: `gt.${after}` } : {}),
  });
}

export async function indexedContractsById(ids: string[]): Promise<IndexedContract[]> {
  if (ids.length === 0) return [];
  return apiGet<IndexedContract>("contracts", {
    select: CONTRACT_COLUMNS,
    contract_id: `in.(${ids.join(",")})`,
  });
}

// a ranking adds up every call in the window, so it reads on four threads. Keep
// `days` to 30 at most: 90 days of calls don't fit in the time limit
/** Contracts with the most calls over the last `days` days. */
export async function indexedActiveContracts(
  limit: number,
  days = 1,
): Promise<Array<{ contractId: string; calls: number }>> {
  const rows = await chQuery<{ contract_id: string; calls: string | number }>(
    `SELECT contract_id, count() AS calls FROM contract_calls
     WHERE closed_at >= now() - INTERVAL {days:UInt32} DAY
     GROUP BY contract_id ORDER BY calls DESC LIMIT {limit:UInt32}
     SETTINGS max_threads = 4`,
    { limit, days },
  );
  return rows.map((r) => ({ contractId: r.contract_id, calls: Number(r.calls) }));
}

/** Contracts with the most calls over the last `days` days, with how many accounts called them. */
export async function indexedTopContracts(
  days: number,
  limit: number,
): Promise<Array<{ contractId: string; calls: number; callers: number }>> {
  const rows = await chQuery<{ contract_id: string; calls: string | number; callers: string | number }>(
    `SELECT contract_id, count() AS calls, uniq(caller) AS callers FROM contract_calls
     WHERE closed_at >= now() - INTERVAL {days:UInt32} DAY
     GROUP BY contract_id ORDER BY calls DESC LIMIT {limit:UInt32}
     SETTINGS max_threads = 4`,
    { days, limit },
  );
  return rows.map((r) => ({ contractId: r.contract_id, calls: Number(r.calls), callers: Number(r.callers) }));
}

interface ChCreation {
  creator: string;
  closed_ts: number;
  ledger_sequence: number;
}

/** Who deployed the contract and when. Null when the indexer doesn't know. */
export async function indexedContractCreation(contractId: string): Promise<ContractCreation | null> {
  const [row] = await chQuery<ChCreation>(
    `SELECT creator, toUnixTimestamp(closed_at) AS closed_ts, ledger_sequence
     FROM contract_creations WHERE contract_id = {contract:String}`,
    { contract: contractId },
  );
  if (!row?.creator) return null;
  return {
    creator: row.creator,
    createdAt: new Date(Number(row.closed_ts) * 1000).toISOString(),
    ledger: Number(row.ledger_sequence),
  };
}
