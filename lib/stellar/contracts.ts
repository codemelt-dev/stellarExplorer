import "server-only";
import { cache } from "react";
import { Address, xdr, scValToNative, contract } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import { activeNetwork } from "./network";
import { toDecodedValue, type DecodedValue } from "./xdrDecode";

async function rpcServer(): Promise<Server | null> {
  const url = (await activeNetwork()).rpcUrl;
  return url ? new Server(url) : null;
}

export interface ContractSummary {
  contractId: string;
  executable:
    | { kind: "wasm"; wasmHash: string }
    | { kind: "stellarAsset" }
    | { kind: "unknown" };
  /** Instance storage entries stored alongside the contract instance. */
  instanceStorage: Array<{ key: string; value: DecodedValue }>;
  lastModifiedLedger: number | null;
  /** TTL: ledger until which the instance lives. */
  liveUntilLedger: number | null;
}

/** Contract instance from RPC getLedgerEntries. null -> not found / RPC down. */
export const getContractSummary = cache(
  async (contractId: string): Promise<ContractSummary | null> => {
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

      const instance = entry.val.contractData().val().instance();
      const exec = instance.executable();

      let executable: ContractSummary["executable"] = { kind: "unknown" };
      if (exec.switch().name === "contractExecutableWasm") {
        executable = {
          kind: "wasm",
          wasmHash: exec.wasmHash().toString("hex"),
        };
      } else if (exec.switch().name === "contractExecutableStellarAsset") {
        executable = { kind: "stellarAsset" };
      }

      const instanceStorage = (instance.storage() ?? []).map((item) => {
        let keyText: string;
        try {
          const native = scValToNative(item.key());
          keyText =
            typeof native === "string" ? native : JSON.stringify(native, (_, v) =>
              typeof v === "bigint" ? v.toString() : v,
            );
        } catch {
          keyText = item.key().toXDR("base64");
        }
        let value: DecodedValue;
        try {
          value = toDecodedValue(scValToNative(item.val()));
        } catch {
          value = { kind: "raw", text: item.val().toXDR("base64") };
        }
        return { key: keyText, value };
      });

      return {
        contractId,
        executable,
        instanceStorage,
        lastModifiedLedger: entry.lastModifiedLedgerSeq ?? null,
        liveUntilLedger: entry.liveUntilLedgerSeq ?? null,
      };
    } catch {
      return null;
    }
  },
);

export interface ContractFunction {
  name: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: string[];
}

// parsing a spec means RPC round-trips, so completed lookups stick around a while
const ifaceCache = new Map<
  string,
  { expires: number; value: ContractFunction[] | null }
>();

/** Function signatures parsed from the contract's WASM spec (contract meta). */
export const getContractInterface = cache(
  async (contractId: string): Promise<ContractFunction[] | null> => {
    const network = await activeNetwork();
    if (!network.rpcUrl) return null;
    const cacheKey = `${network.id}:${contractId}`;
    const cached = ifaceCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    try {
      const client = await contract.Client.from({
        contractId,
        rpcUrl: network.rpcUrl,
        networkPassphrase: network.passphrase,
      });
      const value = client.spec
        .funcs()
        .map((fn) => ({
          name: fn.name().toString(),
          inputs: fn.inputs().map((input) => ({
            name: input.name().toString(),
            type: scSpecTypeName(input.type()),
          })),
          outputs: fn.outputs().map(scSpecTypeName),
        }))
        .filter((fn) => !fn.name.startsWith("__"));
      ifaceCache.set(cacheKey, { expires: Date.now() + 600_000, value });
      return value;
    } catch {
      // SAC contracts and unretrievable wasm end up here - the page shows
      // a graceful fallback. Cache that too, retrying every view is wasteful
      ifaceCache.set(cacheKey, { expires: Date.now() + 600_000, value: null });
      return null;
    }
  },
);

function scSpecTypeName(type: xdr.ScSpecTypeDef): string {
  const name = type.switch().name.replace(/^scSpecType/, "");
  try {
    switch (type.switch().name) {
      case "scSpecTypeOption":
        return `Option<${scSpecTypeName(type.option().valueType())}>`;
      case "scSpecTypeVec":
        return `Vec<${scSpecTypeName(type.vec().elementType())}>`;
      case "scSpecTypeMap":
        return `Map<${scSpecTypeName(type.map().keyType())}, ${scSpecTypeName(type.map().valueType())}>`;
      case "scSpecTypeResult":
        return `Result<${scSpecTypeName(type.result().okType())}>`;
      case "scSpecTypeUdt":
        return type.udt().name().toString();
      default:
        return name;
    }
  } catch {
    return name;
  }
}

export interface ContractEventItem {
  txHash: string;
  ledger: number;
  createdAt: string;
  topics: DecodedValue[];
  data: DecodedValue;
}

// recent events only, RPC bounds the scan window. Full history needs an indexer
export const getContractEvents = cache(
  async (contractId: string): Promise<ContractEventItem[] | null> => {
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
  },
);
