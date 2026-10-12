import { contract, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { AssetRef } from "./txFlow";
import { toDecodedValue, verifiedStellarAsset, type DecodedValue } from "./xdrDecode";

// pure contract decoders shared by the RPC and indexer paths

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

export interface ContractFunction {
  name: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: string[];
}

export function instanceSummary(
  contractId: string,
  instance: xdr.ScContractInstance,
  lastModifiedLedger: number | null,
  liveUntilLedger: number | null,
): ContractSummary {
  const exec = instance.executable();
  let executable: ContractSummary["executable"] = { kind: "unknown" };
  if (exec.switch().name === "contractExecutableWasm") {
    executable = { kind: "wasm", wasmHash: exec.wasmHash().toString("hex") };
  } else if (exec.switch().name === "contractExecutableStellarAsset") {
    executable = { kind: "stellarAsset" };
  }

  const instanceStorage = (instance.storage() ?? []).map((item) => {
    let keyText: string;
    try {
      const native = scValToNative(item.key());
      keyText =
        typeof native === "string"
          ? native
          : JSON.stringify(native, (_, v) => (typeof v === "bigint" ? v.toString() : v));
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

  return { contractId, executable, instanceStorage, lastModifiedLedger, liveUntilLedger };
}

/**
 * The Stellar asset a contract stands for, read from the name it keeps in its
 * instance storage and checked against its address. Undefined for any other contract.
 */
export function contractAsset(summary: ContractSummary, passphrase: string): AssetRef | undefined {
  if (summary.executable.kind !== "stellarAsset") return undefined;
  const metadata = summary.instanceStorage.find((e) => e.key === "METADATA")?.value;
  if (metadata?.kind !== "map") return undefined;
  const name = metadata.entries.find((e) => e.key === "name")?.value;
  if (name?.kind !== "scalar") return undefined;
  return verifiedStellarAsset(name.text, summary.contractId, passphrase);
}

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

/** Public function signatures out of a contract spec. */
export function specFunctions(spec: contract.Spec): ContractFunction[] {
  return spec
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
}

const NUMERIC = new Set([
  "u32", "i32", "u64", "i64", "u128", "i128", "u256", "i256", "timepoint", "duration",
]);

function text(value: string): DecodedValue {
  const isAddress = value.length === 56 && (value.startsWith("G") || value.startsWith("C"));
  return { kind: "scalar", text: value, hint: isAddress ? "address" : "string" };
}

// map keys are ScVals too; a plain one reads as its text, anything nested as JSON
function keyText(key: unknown): string {
  const decoded = fromScJson(key);
  return decoded.kind === "scalar" ? decoded.text : JSON.stringify(key);
}

/**
 * The indexer's JSON form of an ScVal, an object keyed by its type
 * ({"symbol":"transfer"}, {"i128":"63475"}, {"vec":[...]},
 * {"map":[{"key":...,"val":...}]}), into the value ScValView renders.
 * Unknown shapes come back raw instead of throwing.
 */
export function fromScJson(json: unknown): DecodedValue {
  if (json === null || json === undefined || json === "void") {
    return { kind: "scalar", text: "void" };
  }
  if (typeof json === "string") return text(json);
  if (typeof json === "number" || typeof json === "boolean") {
    return { kind: "scalar", text: String(json), hint: typeof json === "number" ? "number" : undefined };
  }
  if (typeof json !== "object" || Array.isArray(json)) {
    return { kind: "raw", text: JSON.stringify(json) };
  }
  const entries = Object.entries(json as Record<string, unknown>);
  if (entries.length !== 1) return { kind: "raw", text: JSON.stringify(json) };
  const [tag, value] = entries[0];

  if (NUMERIC.has(tag) && (typeof value === "string" || typeof value === "number")) {
    return { kind: "scalar", text: String(value), hint: "number" };
  }
  switch (tag) {
    case "void":
      return { kind: "scalar", text: "void" };
    case "bool":
      return { kind: "scalar", text: String(value) };
    case "symbol":
    case "string":
    case "address":
      if (typeof value === "string") return text(value);
      break;
    case "bytes":
      if (typeof value === "string") return { kind: "scalar", text: `0x${value}` };
      break;
    case "vec":
      if (Array.isArray(value)) return { kind: "list", items: value.map(fromScJson) };
      if (value === null) return { kind: "list", items: [] };
      break;
    case "map":
      if (Array.isArray(value)) {
        return {
          kind: "map",
          entries: value.map((e) => {
            const entry = (e ?? {}) as { key?: unknown; val?: unknown };
            return { key: keyText(entry.key), value: fromScJson(entry.val) };
          }),
        };
      }
      if (value === null) return { kind: "map", entries: [] };
      break;
  }
  return { kind: "raw", text: JSON.stringify(json) };
}
