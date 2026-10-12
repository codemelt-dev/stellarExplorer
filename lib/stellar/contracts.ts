import "server-only";
import { cache } from "react";
import { Address, StrKey, xdr, scValToNative, contract } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import { activeNetwork } from "./network";
import { toDecodedValue, type DecodedValue } from "./xdrDecode";
import {
  instanceSummary,
  specFunctions,
  type ContractFunction,
  type ContractSummary,
} from "./contractDecode";
import { indexerActive, withIndexer } from "./indexer/client";
import {
  indexedContractCreation,
  indexedContractEvents,
  indexedContractInterface,
  indexedContractSummary,
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

/** Who deployed it and when. Only the indexer knows, and only since its go-live. */
export const getContractCreation = cache(
  async (contractId: string): Promise<ContractCreation | null> => {
    if (!(await indexerActive())) return null;
    try {
      return await indexedContractCreation(contractId);
    } catch (error) {
      console.warn(
        "[indexer] contract creation failed:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  },
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
