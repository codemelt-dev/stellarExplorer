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
  ContractCreation,
  ContractEventItem,
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

const STORAGE_PAGE = 50;

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

/** Newest 100 events a contract emitted. Fee events (op_index -1) are left out. */
export async function indexedContractEvents(contractId: string): Promise<ContractEventItem[]> {
  const rows = await chQuery<ChEvent>(
    `WITH page AS (
       SELECT ledger_sequence, tx_index, op_index, event_index,
              toUnixTimestamp(closed_at) AS closed_ts, topics, data
       FROM events WHERE contract_id = {contract:String} AND op_index >= 0
       ORDER BY ledger_sequence DESC, tx_index DESC, op_index DESC, event_index DESC LIMIT 100)
     SELECT p.ledger_sequence AS ledger_sequence, p.closed_ts AS closed_ts,
            p.topics AS topics, p.data AS data, lower(hex(t.hash)) AS tx_hash
     FROM page AS p
     LEFT JOIN (SELECT ledger_sequence, tx_index, hash FROM transactions
                WHERE (ledger_sequence, tx_index) IN (SELECT ledger_sequence, tx_index FROM page)) AS t
            USING (ledger_sequence, tx_index)
     ORDER BY p.ledger_sequence DESC, p.tx_index DESC, p.op_index DESC, p.event_index DESC`,
    { contract: contractId },
  );
  return rows.map((e) => ({
    txHash: e.tx_hash,
    ledger: Number(e.ledger_sequence),
    createdAt: new Date(Number(e.closed_ts) * 1000).toISOString(),
    topics: (Array.isArray(e.topics) ? e.topics : []).map((t) => fromScJson(parse(t))),
    data: fromScJson(parse(e.data)),
  }));
}

interface ChCreation {
  creator: string;
  closed_ts: number;
  ledger_sequence: number;
}

/** Who deployed the contract and when. Null when it predates the indexer. */
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
