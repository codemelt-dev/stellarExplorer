import "server-only";
import { cache } from "react";
import { Address, StrKey, xdr, scValToNative, contract } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import { activeNetwork } from "./network";
import { toDecodedValue, type DecodedValue } from "./xdrDecode";
import {
  instanceSummary,
  specFunctions,
  tokenMetadata,
  type ContractFunction,
  type ContractSummary,
  type TokenInfo,
} from "./contractDecode";
import { indexerActive, indexerRead, withIndexer } from "./indexer/client";
import { fromAssetKey, type AssetIdentity } from "./assetId";
import {
  indexedActiveContracts,
  indexedContractCreation,
  indexedContractEvents,
  indexedContracts,
  indexedContractsById,
  indexedContractInterface,
  indexedContractStorage,
  indexedContractSummary,
  indexedContractWasm,
} from "./indexer/contracts";

async function rpcServer(): Promise<Server | null> {
  const url = (await activeNetwork()).rpcUrl;
  return url ? new Server(url) : null;
}

export type { ContractFunction, ContractSummary } from "./contractDecode";

/** Who deployed a contract and when. */
export interface ContractCreation {
  creator: string;
  createdAt: string;
  ledger: number;
}

async function rpcContractSummary(contractId: string): Promise<ContractSummary | null> {
  const server = await rpcServer();
  if (!server) return null;
  try {
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(contractId).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    );
    const response = await server.getLedgerEntries(key);
    const entry = response.entries[0];
    if (!entry) return null;
    return instanceSummary(
      contractId,
      entry.val.contractData().val().instance(),
      entry.lastModifiedLedgerSeq ?? null,
      entry.liveUntilLedgerSeq ?? null,
    );
  } catch {
    return null;
  }
}

/** No source could answer, which is not the same as "no such contract". */
export class ContractSourceError extends Error {}

/**
 * Contract instance: indexer on mainnet, RPC otherwise. null -> not found.
 * Throws ContractSourceError when the indexer failed and nothing else answered:
 * mainnet has no RPC behind it, so that case must not read as "doesn't exist".
 */
export const getContractSummary = cache(
  async (contractId: string): Promise<ContractSummary | null> => {
    if (!StrKey.isValidContract(contractId)) return null;
    let indexerFailed = false;
    const summary = await withIndexer(
      `contract ${contractId.slice(0, 6)}`,
      async () => {
        try {
          return await indexedContractSummary(contractId);
        } catch (error) {
          indexerFailed = true;
          throw error;
        }
      },
      () => rpcContractSummary(contractId),
    );
    if (!summary && indexerFailed) throw new ContractSourceError("contract source unavailable");
    return summary;
  },
);

export interface ContractStorageEntry {
  keyHash: string;
  durability: "persistent" | "temporary";
  key: DecodedValue;
  value: DecodedValue;
  /** Ledger until which the entry lives, null when unknown. */
  liveUntilLedger: number | null;
  expired: boolean;
}

export interface ContractStoragePage {
  entries: ContractStorageEntry[];
  /** Key hash to continue from, null on the last page. */
  next: string | null;
}

/**
 * Persistent and temporary entries, a page at a time. Only the indexer can
 * list them (RPC needs each key up front), so null everywhere else.
 */
export const getContractStorage = cache(
  async (contractId: string, after?: string): Promise<ContractStoragePage | null> => {
    if (!StrKey.isValidContract(contractId)) return null;
    if (after && !/^[0-9a-f]{64}$/.test(after)) return null;
    return indexerRead(`contract ${contractId.slice(0, 6)} storage`, () =>
      indexedContractStorage(contractId, after),
    );
  },
);

async function rpcContractWasm(contractId: string): Promise<{ hash: string; wasm: Buffer } | null> {
  const server = await rpcServer();
  const summary = await rpcContractSummary(contractId);
  if (!server || summary?.executable.kind !== "wasm") return null;
  try {
    const hash = summary.executable.wasmHash;
    const key = xdr.LedgerKey.contractCode(
      new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, "hex") }),
    );
    const entry = (await server.getLedgerEntries(key)).entries[0];
    return entry ? { hash, wasm: Buffer.from(entry.val.contractCode().code()) } : null;
  } catch {
    return null;
  }
}

/** The contract's compiled code and its hash, or null (asset contract, not found, source down). */
export async function getContractWasm(
  contractId: string,
): Promise<{ hash: string; wasm: Buffer } | null> {
  if (!StrKey.isValidContract(contractId)) return null;
  return withIndexer(
    `contract ${contractId.slice(0, 6)} wasm`,
    () => indexedContractWasm(contractId),
    () => rpcContractWasm(contractId),
  );
}

export interface ContractListRow {
  contractId: string;
  /** Hash of its code, null for a Stellar asset's contract. */
  wasmHash: string | null;
  /** The asset it stands for, when it is a Stellar asset's contract. */
  asset: AssetIdentity | null;
  /** Calls in the last day, on the activity ranking only. */
  calls: number | null;
}

export interface ContractDirectoryPage {
  rows: ContractListRow[];
  nextCursor: string | null;
}

const DIRECTORY_PAGE = 50;

/**
 * Contracts from the indexer: the busiest of the last day, or all of them in
 * address order. Null where there is no indexer (testnet); throws when it fails.
 */
export async function getContractDirectory(
  view: "active" | "all",
  cursor?: string,
): Promise<ContractDirectoryPage | null> {
  if (!(await indexerActive())) return null;

  if (view === "all") {
    const after = cursor && StrKey.isValidContract(cursor) ? cursor : undefined;
    const found = await indexedContracts(after, DIRECTORY_PAGE);
    return {
      rows: found.map((c) => ({
        contractId: c.contract_id,
        wasmHash: c.wasm_hash,
        asset: c.asset ? fromAssetKey(c.asset) : null,
        calls: null,
      })),
      nextCursor:
        found.length === DIRECTORY_PAGE ? found[found.length - 1].contract_id : null,
    };
  }

  const active = (await indexedActiveContracts(DIRECTORY_PAGE)).filter((c) =>
    StrKey.isValidContract(c.contractId),
  );
  // what each one is comes from current state; a miss there just leaves the type blank
  let known = new Map<string, { wasmHash: string | null; asset: AssetIdentity | null }>();
  try {
    const details = await indexedContractsById(active.map((c) => c.contractId));
    known = new Map(
      details.map((c) => [
        c.contract_id,
        { wasmHash: c.wasm_hash, asset: c.asset ? fromAssetKey(c.asset) : null },
      ]),
    );
  } catch (error) {
    console.warn(
      "[indexer] contract types failed:",
      error instanceof Error ? error.message : error,
    );
  }
  return {
    rows: active.map((c) => ({
      contractId: c.contractId,
      wasmHash: known.get(c.contractId)?.wasmHash ?? null,
      asset: known.get(c.contractId)?.asset ?? null,
      calls: c.calls,
    })),
    nextCursor: null,
  };
}

// a token's symbol and decimals don't change from view to view
const tokenCache = new Map<string, { expires: number; value: TokenInfo | null }>();

/** Symbol and decimals a token contract reports about itself, or null. Never throws. */
export const getTokenInfo = cache(async (contractId: string): Promise<TokenInfo | null> => {
  const cacheKey = `${(await activeNetwork()).id}:${contractId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  let value: TokenInfo | null = null;
  try {
    const summary = await getContractSummary(contractId);
    value = (summary && tokenMetadata(summary)) ?? null;
  } catch {
    // source down: say nothing rather than cache a miss
    return null;
  }
  tokenCache.set(cacheKey, { expires: Date.now() + 600_000, value });
  return value;
});

/** Who deployed it and when. Only the indexer knows, and only since its go-live. */
export const getContractCreation = cache(
  async (contractId: string): Promise<ContractCreation | null> =>
    indexerRead(`contract ${contractId.slice(0, 6)} creation`, () =>
      indexedContractCreation(contractId),
    ),
);

// parsing a spec means RPC round-trips, so completed lookups stick around a while
const ifaceCache = new Map<
  string,
  { expires: number; value: ContractFunction[] | null }
>();

async function rpcContractInterface(contractId: string): Promise<ContractFunction[] | null> {
  const network = await activeNetwork();
  if (!network.rpcUrl) return null;
  try {
    const client = await contract.Client.from({
      contractId,
      rpcUrl: network.rpcUrl,
      networkPassphrase: network.passphrase,
    });
    return specFunctions(client.spec);
  } catch {
    // SAC contracts and unretrievable wasm end up here - the page shows
    // a graceful fallback
    return null;
  }
}

/** Function signatures parsed from the contract's WASM spec (contract meta). */
export const getContractInterface = cache(
  async (contractId: string): Promise<ContractFunction[] | null> => {
    const cacheKey = `${(await activeNetwork()).id}:${contractId}`;
    const cached = ifaceCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = await withIndexer(
      `contract ${contractId.slice(0, 6)} interface`,
      () => indexedContractInterface(contractId),
      () => rpcContractInterface(contractId),
    );
    // misses are cached too, retrying every view is wasteful
    ifaceCache.set(cacheKey, { expires: Date.now() + 600_000, value });
    return value;
  },
);

export interface ContractEventItem {
  txHash: string;
  ledger: number;
  createdAt: string;
  topics: DecodedValue[];
  data: DecodedValue;
}

/** Recent events: indexer on mainnet, else RPC, which only scans a bounded window. */
export const getContractEvents = cache(
  async (contractId: string): Promise<ContractEventItem[] | null> =>
    withIndexer(
      `contract ${contractId.slice(0, 6)} events`,
      () => indexedContractEvents(contractId),
      () => rpcContractEvents(contractId),
    ),
);

async function rpcContractEvents(contractId: string): Promise<ContractEventItem[] | null> {
  const server = await rpcServer();
  if (!server) return null;
  try {
    const latest = await server.getLatestLedger();
    const startLedger = Math.max(1, latest.sequence - 9_900);
    const response = await server.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: [contractId] }],
      limit: 100,
    });
    return response.events
      .map((event) => ({
        txHash: event.txHash,
        ledger: event.ledger,
        createdAt: event.ledgerClosedAt,
        topics: event.topic.map((t) => {
          try {
            return toDecodedValue(scValToNative(t));
          } catch {
            return { kind: "raw", text: t.toXDR("base64") } as DecodedValue;
          }
        }),
        data: (() => {
          try {
            return toDecodedValue(scValToNative(event.value));
          } catch {
            return { kind: "raw", text: "unreadable" } as DecodedValue;
          }
        })(),
      }))
      .reverse(); // newest first
  } catch {
    return null;
  }
}
