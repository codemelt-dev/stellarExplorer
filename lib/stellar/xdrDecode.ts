import { Address, Asset, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { AssetRef } from "./txFlow";

// defensive decoders: anything that fails to parse returns null and the UI
// falls back to "view raw"

/** JSON-safe rendering of an scValToNative result (bigint, bytes, Map...). */
export type DecodedValue =
  | { kind: "scalar"; text: string; hint?: "address" | "number" | "string" }
  | { kind: "list"; items: DecodedValue[] }
  | { kind: "map"; entries: Array<{ key: string; value: DecodedValue }> }
  | { kind: "raw"; text: string };

export function toDecodedValue(native: unknown): DecodedValue {
  if (native === null || native === undefined) {
    return { kind: "scalar", text: "void" };
  }
  if (typeof native === "bigint" || typeof native === "number") {
    return { kind: "scalar", text: native.toString(), hint: "number" };
  }
  if (typeof native === "boolean") {
    return { kind: "scalar", text: String(native) };
  }
  if (typeof native === "string") {
    const isAddress =
      native.length === 56 && (native.startsWith("G") || native.startsWith("C"));
    return {
      kind: "scalar",
      text: native,
      hint: isAddress ? "address" : "string",
    };
  }
  if (native instanceof Uint8Array) {
    return { kind: "scalar", text: `0x${Buffer.from(native).toString("hex")}` };
  }
  if (Array.isArray(native)) {
    return { kind: "list", items: native.map(toDecodedValue) };
  }
  if (native instanceof Map) {
    return {
      kind: "map",
      entries: [...native.entries()].map(([k, v]) => ({
        key: String(k),
        value: toDecodedValue(v),
      })),
    };
  }
  if (typeof native === "object") {
    return {
      kind: "map",
      entries: Object.entries(native as Record<string, unknown>).map(
        ([k, v]) => ({ key: k, value: toDecodedValue(v) }),
      ),
    };
  }
  return { kind: "raw", text: String(native) };
}

export function decodeScValBase64(b64: string): DecodedValue | null {
  try {
    return toDecodedValue(scValToNative(xdr.ScVal.fromXDR(b64, "base64")));
  } catch {
    return null;
  }
}

export interface SorobanInvocation {
  kind: "invokeContract" | "createContract" | "uploadWasm";
  contractId?: string;
  functionName?: string;
  args: DecodedValue[];
}

/** Decoded invoke_host_function details from the tx envelope. */
export function parseSorobanInvocation(
  envelopeXdr: string,
  opIndex: number,
): SorobanInvocation | null {
  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
    const tx =
      envelope.switch() === xdr.EnvelopeType.envelopeTypeTxFeeBump()
        ? envelope.feeBump().tx().innerTx().v1().tx()
        : envelope.switch() === xdr.EnvelopeType.envelopeTypeTxV0()
          ? envelope.v0().tx()
          : envelope.v1().tx();

    const op = tx.operations()[opIndex];
    if (!op) return null;
    if (op.body().switch() !== xdr.OperationType.invokeHostFunction()) {
      return null;
    }

    const hostFn = op.body().invokeHostFunctionOp().hostFunction();
    switch (hostFn.switch().name) {
      case "hostFunctionTypeInvokeContract": {
        const invocation = hostFn.invokeContract();
        return {
          kind: "invokeContract",
          contractId: Address.fromScAddress(
            invocation.contractAddress(),
          ).toString(),
          functionName: invocation.functionName().toString(),
          args: invocation
            .args()
            .map((arg) => toDecodedValue(scValToNative(arg))),
        };
      }
      case "hostFunctionTypeCreateContract":
      case "hostFunctionTypeCreateContractV2":
        return { kind: "createContract", args: [] };
      case "hostFunctionTypeUploadContractWasm":
        return { kind: "uploadWasm", args: [] };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Soroban return value from result meta (TransactionMeta v3/v4). */
export function getSorobanReturnValue(
  resultMetaXdr: string | undefined,
): DecodedValue | null {
  if (!resultMetaXdr) return null;
  try {
    const meta = xdr.TransactionMeta.fromXDR(resultMetaXdr, "base64");
    let returnValue: xdr.ScVal | null | undefined;
    if (meta.switch() === 3) {
      returnValue = meta.v3().sorobanMeta()?.returnValue();
    } else if (meta.switch() === 4) {
      returnValue = meta.v4().sorobanMeta()?.returnValue();
    }
    if (!returnValue) return null;
    const native = scValToNative(returnValue);
    if (native === undefined || native === null) return null;
    return toDecodedValue(native);
  } catch {
    return null;
  }
}

/**
 * One transaction's meta, base64, out of a ledger archive file
 * (LedgerCloseMetaBatch). Null when the hash isn't in that ledger.
 */
export function transactionMetaFromLedger(batch: Buffer, hash: string): string | null {
  try {
    const lcm = xdr.LedgerCloseMetaBatch.fromXDR(batch).ledgerCloseMeta()[0];
    if (!lcm) return null;
    const body = lcm.switch() === 0 ? lcm.v0() : lcm.switch() === 1 ? lcm.v1() : lcm.v2();
    for (const applied of body.txProcessing()) {
      if (applied.result().transactionHash().toString("hex") === hash) {
        return applied.txApplyProcessing().toXDR("base64");
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface DecodedContractEvent {
  contractId: string | null;
  topics: DecodedValue[];
  data: DecodedValue;
}

/** Events emitted by the contracts a transaction called. Fee events are separate, see getFeeEvents. */
export function getSorobanEvents(
  resultMetaXdr: string | undefined,
): DecodedContractEvent[] {
  if (!resultMetaXdr) return [];
  try {
    const meta = xdr.TransactionMeta.fromXDR(resultMetaXdr, "base64");
    let events: xdr.ContractEvent[] = [];
    if (meta.switch() === 3) {
      events = meta.v3().sorobanMeta()?.events() ?? [];
    } else if (meta.switch() === 4) {
      // v4 splits events: contract events (transfer, mint, ...) live per
      // operation, the tx-level events() are the network charging the fee
      events = meta.v4().operations().flatMap((o) => o.events());
    }
    return events.map((event) => {
      let contractId: string | null = null;
      try {
        const raw = event.contractId();
        if (raw) {
          contractId = Address.contract(
            Buffer.from(raw as unknown as Uint8Array),
          ).toString();
        }
      } catch {
        contractId = null;
      }
      const body = event.body().v0();
      return {
        contractId,
        topics: body.topics().map((t) => {
          try {
            return toDecodedValue(scValToNative(t));
          } catch {
            return { kind: "raw", text: t.toXDR("base64") } as DecodedValue;
          }
        }),
        data: (() => {
          try {
            return toDecodedValue(scValToNative(body.data()));
          } catch {
            return { kind: "raw", text: "unreadable" } as DecodedValue;
          }
        })(),
      };
    });
  } catch {
    return [];
  }
}

export interface FeeEvents {
  /** Stroops taken up front. */
  charged: string;
  /** Stroops handed back after the transaction ran, "0" when none. */
  refunded: string;
}

/**
 * The fee as the ledger recorded it (meta v4): charged before the transaction,
 * the unused part refunded after. Null when the meta has no fee events.
 */
export function getFeeEvents(resultMetaXdr: string | undefined): FeeEvents | null {
  if (!resultMetaXdr) return null;
  try {
    const meta = xdr.TransactionMeta.fromXDR(resultMetaXdr, "base64");
    if (meta.switch() !== 4) return null;
    let charged = 0n;
    let refunded = 0n;
    let seen = false;
    for (const txEvent of meta.v4().events()) {
      const body = txEvent.event().body().v0();
      if (scValToNative(body.topics()[0]) !== "fee") continue;
      const amount = scValToNative(body.data());
      if (typeof amount !== "bigint") continue;
      seen = true;
      if (amount >= 0n) charged += amount;
      else refunded -= amount;
    }
    return seen ? { charged: charged.toString(), refunded: refunded.toString() } : null;
  } catch {
    return null;
  }
}

export interface TokenMovement {
  account: string;
  direction: "in" | "out";
  /** raw base units (i128). 7 decimals when `asset` is set, unknown otherwise. */
  amount: string;
  /** the token contract id. */
  token: string;
  /** set when the token is a Stellar asset's own contract. */
  asset?: AssetRef;
  kind: "transfer" | "mint" | "burn" | "clawback";
  /** Overrides the kind's wording, e.g. "trade filled". */
  label?: string;
}

export interface TokenEventDescription {
  kind: "transfer" | "mint" | "burn" | "clawback";
  token: string;
  from?: string;
  to?: string;
  /** raw base units (i128). 7 decimals when `asset` is set, unknown otherwise. */
  amount: string;
  /** set when the token is a Stellar asset's own contract. */
  asset?: AssetRef;
}

function scalarText(v: DecodedValue | undefined): string | null {
  return v && v.kind === "scalar" ? v.text : null;
}

/**
 * The asset behind `name` ("native" or "CODE:ISSUER"), but only if `contractId`
 * really is that asset's contract. Any contract can claim a name, the address
 * can't be faked.
 */
export function verifiedStellarAsset(
  name: string,
  contractId: string,
  passphrase: string,
): AssetRef | undefined {
  try {
    if (name === "native") {
      return Asset.native().contractId(passphrase) === contractId ? { code: "XLM" } : undefined;
    }
    const [code, issuer, ...rest] = name.split(":");
    if (!code || !issuer || rest.length) return undefined;
    return new Asset(code, issuer).contractId(passphrase) === contractId
      ? { code, issuer }
      : undefined;
  } catch {
    return undefined;
  }
}

// a Stellar asset's contract names its asset in the last topic of its events
function stellarAsset(event: DecodedContractEvent, passphrase: string): AssetRef | undefined {
  const last = event.topics[event.topics.length - 1];
  if (
    !event.contractId ||
    event.topics.length < 2 ||
    last?.kind !== "scalar" ||
    last.hint !== "string"
  ) {
    return undefined;
  }
  return verifiedStellarAsset(last.text, event.contractId, passphrase);
}

// plain i128, or a map with "amount" when the transfer targets a muxed account
function eventAmount(data: DecodedValue): string | null {
  const direct = scalarText(data);
  if (direct !== null) return direct;
  if (data.kind !== "map") return null;
  return scalarText(data.entries.find((e) => e.key === "amount")?.value);
}

// SEP-41 / Stellar Asset Contract token event -> a readable {from, to, amount}.
// Returns null for anything that is not a recognized token event (custom
// events, ...), so the raw topic/data view stays the fallback.
export function describeTokenEvent(
  event: DecodedContractEvent,
  passphrase: string,
): TokenEventDescription | null {
  if (!event.contractId) return null;
  const name = scalarText(event.topics[0]);
  const amount = eventAmount(event.data);
  if (!name || amount === null || !/^-?\d+$/.test(amount)) return null;
  const token = event.contractId;
  const asset = stellarAsset(event, passphrase);
  const addrs = event.topics
    .slice(1)
    .filter((t) => t.kind === "scalar" && t.hint === "address")
    .map((t) => (t as Extract<DecodedValue, { kind: "scalar" }>).text);
  switch (name) {
    case "transfer": // topics: transfer, from, to
      if (addrs.length < 2) return null;
      return { kind: "transfer", token, from: addrs[0], to: addrs[1], amount, asset };
    case "mint": // mint, [admin], to
      if (!addrs.length) return null;
      return { kind: "mint", token, to: addrs[addrs.length - 1], amount, asset };
    case "burn": // burn, from
      if (!addrs.length) return null;
      return { kind: "burn", token, from: addrs[0], amount, asset };
    case "clawback": // clawback, [admin], from
      if (!addrs.length) return null;
      return { kind: "clawback", token, from: addrs[addrs.length - 1], amount, asset };
    default:
      return null;
  }
}

// Token events -> per-account balance movements for the Effects tab. Horizon
// effects don't include these, so without this a contract transfer shows
// nothing but the network fee.
export function sorobanTokenMovements(
  events: DecodedContractEvent[],
  passphrase: string,
): TokenMovement[] {
  const movements: TokenMovement[] = [];
  for (const event of events) {
    const d = describeTokenEvent(event, passphrase);
    if (!d) continue;
    const { amount, token, asset, kind } = d;
    if (d.from) movements.push({ account: d.from, direction: "out", amount, token, asset, kind });
    if (d.to) movements.push({ account: d.to, direction: "in", amount, token, asset, kind });
  }
  return movements;
}

/** "paymentUnderfunded" -> "payment underfunded" */
function humanCode(name: string): string {
  return name
    .replace(/^tx/, "transaction ")
    .replace(/^op/, "operation ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

export interface DecodedTxError {
  transactionCode: string;
  operationCodes: string[];
}

/** Failure reason from result XDR - decoded, never shown as raw code alone. */
export function decodeTxError(resultXdr: string): DecodedTxError | null {
  try {
    const result = xdr.TransactionResult.fromXDR(resultXdr, "base64");
    const pair = result.result();
    const transactionCode = humanCode(pair.switch().name);
    const operationCodes: string[] = [];
    try {
      for (const opResult of pair.results() ?? []) {
        if (opResult.switch().name !== "opInner") {
          operationCodes.push(humanCode(opResult.switch().name));
          continue;
        }
        const tr = opResult.tr();
        const inner = tr.value() as { switch?: () => { name: string } };
        const code = inner?.switch?.().name;
        if (code && !/success/i.test(code)) {
          operationCodes.push(humanCode(code));
        }
      }
    } catch {
      // op-level detail is best effort
    }
    return { transactionCode, operationCodes };
  } catch {
    return null;
  }
}

/**
 * Same reason as decodeTxError, from stored result codes: the transaction's
 * as a number (-1), each operation's as a name ("payment_underfunded").
 */
export function txErrorFromCodes(resultCode: number, opCodes: string[]): DecodedTxError {
  // fromValue exists at runtime, the sdk's typings leave it out
  const codes = xdr.TransactionResultCode as unknown as { fromValue(value: number): { name: string } };
  let transactionCode: string;
  try {
    transactionCode = humanCode(codes.fromValue(resultCode).name);
  } catch {
    transactionCode = `transaction result ${resultCode}`;
  }
  return {
    transactionCode,
    operationCodes: opCodes
      .filter((code) => code && !/success$/.test(code))
      .map((code) => code.replace(/^op_/, "operation ").replace(/_/g, " ")),
  };
}

export interface SorobanResources {
  instructions: number;
  readBytes: number;
  writeBytes: number;
  resourceFeeStroops: string;
}

// soroban resource footprint from the envelope
export function parseSorobanResources(
  envelopeXdr: string,
): SorobanResources | null {
  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
    const tx =
      envelope.switch() === xdr.EnvelopeType.envelopeTypeTxFeeBump()
        ? envelope.feeBump().tx().innerTx().v1().tx()
        : envelope.switch() === xdr.EnvelopeType.envelopeTypeTx()
          ? envelope.v1().tx()
          : null;
    if (!tx || tx.ext().switch() !== 1) return null;
    const data = tx.ext().sorobanData();
    const resources = data.resources();
    return {
      instructions: resources.instructions(),
      readBytes: resources.diskReadBytes(),
      writeBytes: resources.writeBytes(),
      resourceFeeStroops: data.resourceFee().toString(),
    };
  } catch {
    return null;
  }
}

export interface TxPreconditions {
  minTime: string | null;
  maxTime: string | null;
}

export function parsePreconditions(envelopeXdr: string): TxPreconditions | null {
  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
    if (envelope.switch() !== xdr.EnvelopeType.envelopeTypeTx()) return null;
    const cond = envelope.v1().tx().cond();
    let timeBounds: xdr.TimeBounds | null = null;
    if (cond.switch().name === "precondTime") {
      timeBounds = cond.timeBounds();
    } else if (cond.switch().name === "precondV2") {
      timeBounds = cond.v2().timeBounds();
    }
    if (!timeBounds) return null;
    const min = timeBounds.minTime().toString();
    const max = timeBounds.maxTime().toString();
    if (min === "0" && max === "0") return null;
    return {
      minTime: min === "0" ? null : min,
      maxTime: max === "0" ? null : max,
    };
  } catch {
    return null;
  }
}

/** Memo of type hash/return arrives base64 - show as hex. */
export function memoDisplay(
  type: string | undefined,
  value: string | undefined,
): { label: string; text: string } | null {
  if (!type || type === "none" || value === undefined) return null;
  if (type === "text") return { label: "Memo (text)", text: value };
  if (type === "id") return { label: "Memo (id)", text: value };
  try {
    const hex = Buffer.from(value, "base64").toString("hex");
    return { label: `Memo (${type})`, text: hex };
  } catch {
    return { label: `Memo (${type})`, text: value };
  }
}
