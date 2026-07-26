import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";

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

export interface DecodedContractEvent {
  contractId: string | null;
  topics: DecodedValue[];
  data: DecodedValue;
}

/** Contract events from result meta (v3; v4 events live elsewhere - best effort). */
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
      // v4 splits events: the real contract events (transfer, mint, ...) live
      // per-operation; events() holds only tx-level fee events. Gather both.
      const v4 = meta.v4();
      const opEvents = v4.operations().flatMap((o) => o.events());
      const txEvents = v4.events().map((e) => e.event());
      events = [...opEvents, ...txEvents];
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

export interface TokenMovement {
  account: string;
  direction: "in" | "out";
  /** raw base units (i128); displayed as a 7-decimal token, the SAC standard. */
  amount: string;
  /** the token contract id. */
  token: string;
  kind: "transfer" | "mint" | "burn" | "clawback";
}

export interface TokenEventDescription {
  kind: "transfer" | "mint" | "burn" | "clawback";
  token: string;
  from?: string;
  to?: string;
  /** raw base units (i128). */
  amount: string;
}

function scalarText(v: DecodedValue | undefined): string | null {
  return v && v.kind === "scalar" ? v.text : null;
}

// SEP-41 / Stellar Asset Contract token event -> a readable {from, to, amount}.
// Returns null for anything that is not a recognized token event (fee, custom
// events, ...), so the raw topic/data view stays the fallback.
export function describeTokenEvent(
  event: DecodedContractEvent,
): TokenEventDescription | null {
  if (!event.contractId) return null;
  const name = scalarText(event.topics[0]);
  const amount = scalarText(event.data);
  if (!name || amount === null || !/^-?\d+$/.test(amount)) return null;
  const token = event.contractId;
  const addrs = event.topics
    .slice(1)
    .filter((t) => t.kind === "scalar" && t.hint === "address")
    .map((t) => (t as Extract<DecodedValue, { kind: "scalar" }>).text);
  switch (name) {
    case "transfer": // topics: transfer, from, to
      if (addrs.length < 2) return null;
      return { kind: "transfer", token, from: addrs[0], to: addrs[1], amount };
    case "mint": // mint, [admin], to
      if (!addrs.length) return null;
      return { kind: "mint", token, to: addrs[addrs.length - 1], amount };
    case "burn": // burn, from
      if (!addrs.length) return null;
      return { kind: "burn", token, from: addrs[0], amount };
    case "clawback": // clawback, [admin], from
      if (!addrs.length) return null;
      return { kind: "clawback", token, from: addrs[addrs.length - 1], amount };
    default:
      return null;
  }
}

// Token events -> per-account balance movements for the Effects tab. Horizon
// effects don't include these, so without this a contract transfer shows
// nothing but the network fee.
export function sorobanTokenMovements(
  events: DecodedContractEvent[],
): TokenMovement[] {
  const movements: TokenMovement[] = [];
  for (const event of events) {
    const d = describeTokenEvent(event);
    if (!d) continue;
    if (d.from)
      movements.push({ account: d.from, direction: "out", amount: d.amount, token: d.token, kind: d.kind });
    if (d.to)
      movements.push({ account: d.to, direction: "in", amount: d.amount, token: d.token, kind: d.kind });
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
