import { fromScJson } from "../contractDecode";
import {
  sorobanTokenMovements,
  txErrorFromCodes,
  verifiedStellarAsset,
  type DecodedContractEvent,
  type DecodedValue,
  type FeeEvents,
  type SorobanInvocation,
  type TokenMovement,
} from "../xdrDecode";
import type { AssetRef } from "../txFlow";
import type { OperationRecord, TxDetail } from "../transactions";
import { indexedFlow } from "./details";
import { toOperationRecord, type OpTransfer } from "./opRecord";

// One transaction's indexer rows -> the same view the page builds from
// Horizon. Envelope-only parts (signatures, time bounds, resources, raw XDR)
// aren't stored, they stay null and the page loads raw XDR on demand

/** transactions row. Int64 columns arrive as strings. */
export interface ChTxRow {
  ledger_sequence: number;
  tx_index: number;
  // aliased: a select alias named like a column replaces it in WHERE
  tx_hash: string;
  inner_tx_hash: string;
  closed_ts: number;
  source_account: string;
  account_sequence: string;
  fee_account: string;
  max_fee: string;
  fee_charged: string;
  successful: boolean;
  result_code: number;
  memo_type: string;
  memo: string;
}

/** operations row of that transaction. */
export interface ChTxOp {
  op_id: string;
  op_index: number;
  type: number;
  type_name: string;
  source_account: string;
  source_account_muxed: string;
  details: string;
  result_code: string;
  return_value: string;
}

/** events row, contract events only (op_index >= 0). */
export interface ChTxEvent {
  op_index: number;
  contract_id: string;
  topics: string[];
  data: string;
}

/** token_transfers row; op_index -1 is the fee. */
export interface ChTxTransfer {
  op_index: number;
  position: number;
  kind: string;
  asset: string;
  contract_id: string;
  from_address: string;
  to_address: string;
  amount: string;
}

const NO_HASH = "0".repeat(64);
const CALL = "invoke_host_function";
const OFFERS = new Set(["manage_sell_offer", "manage_buy_offer", "create_passive_sell_offer"]);
const PATH_PAYMENTS = new Set(["path_payment_strict_send", "path_payment_strict_receive"]);
const MOVES = new Set(["transfer", "mint", "burn", "clawback"]);

// JSON columns; a value that isn't JSON reads as its text
function parse(value: string): unknown {
  if (value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function invocationOf(details: unknown): SorobanInvocation | null {
  const fn = (details as { host_function?: Record<string, unknown> } | null)?.host_function;
  const [kind, body] = Object.entries(fn ?? {})[0] ?? [];
  if (kind === "invoke_contract") {
    const call = (body ?? {}) as { contract_address?: string; function_name?: string; args?: unknown[] };
    return {
      kind: "invokeContract",
      contractId: call.contract_address,
      functionName: call.function_name,
      args: (call.args ?? []).map(fromScJson),
    };
  }
  if (kind?.startsWith("create_contract")) return { kind: "createContract", args: [] };
  if (kind === "wasm" || kind === "upload_contract_wasm") return { kind: "uploadWasm", args: [] };
  return null;
}

// a call that returned nothing has no "Returned" box, same as from meta
function returnValueOf(raw: string): DecodedValue | null {
  const value = parse(raw);
  if (value === null || value === "void") return null;
  if (typeof value === "object" && "void" in value) return null;
  return fromScJson(value);
}

// the network takes the most it may charge up front and refunds the rest after
function feeEventsOf(transfers: ChTxTransfer[]): FeeEvents | null {
  let charged = 0n;
  let refunded = 0n;
  let seen = false;
  for (const t of transfers) {
    if (t.kind !== "fee") continue;
    seen = true;
    const amount = BigInt(t.amount);
    if (amount >= 0n) charged += amount;
    else refunded -= amount;
  }
  return seen ? { charged: charged.toString(), refunded: refunded.toString() } : null;
}

// wording for a classic op's transfers, the way Horizon's effects put it
function labelsFor(record: OperationRecord | undefined, t: ChTxTransfer): { in?: string; out?: string } {
  const op = record as (OperationRecord & Record<string, unknown>) | undefined;
  if (!op) return {};
  if (op.type === "create_account") return { in: "account created" };
  if (OFFERS.has(op.type)) return { in: "trade filled", out: "trade filled" };
  if (PATH_PAYMENTS.has(op.type)) {
    // legs against offers and pools are trades, the last hop is the payment
    const delivery = t.from_address === op.from && t.to_address === op.to;
    return delivery ? {} : { in: "trade filled", out: "trade filled" };
  }
  return {};
}

// trustline and signer changes move no money but still belong on the Effects tab
function noteOf(record: OperationRecord): { account: string; label: string } | null {
  const op = record as OperationRecord & Record<string, unknown>;
  if (op.type === "change_trust") {
    const asset = op.asset_type === "liquidity_pool_shares" ? "pool" : String(op.asset_code ?? "");
    const removed = op.limit === "0.0000000";
    return { account: op.source_account, label: `trustline ${removed ? "removed" : "set"} (${asset})` };
  }
  if (op.type === "set_options" && typeof op.signer_key === "string") {
    return { account: op.source_account, label: `signer ${op.signer_weight === 0 ? "removed" : "set"}` };
  }
  return null;
}

/** Indexer rows of one transaction -> the page's view. `hash` is the one asked for. */
export function toTxDetail(
  hash: string,
  tx: ChTxRow,
  ops: ChTxOp[],
  events: ChTxEvent[],
  transfers: ChTxTransfer[],
  passphrase: string,
): TxDetail {
  // Horizon's timestamps have no milliseconds
  const createdAt = new Date(Number(tx.closed_ts) * 1000).toISOString().replace(".000Z", "Z");
  const successful = Boolean(tx.successful);
  const details = ops.map((op) => parse(op.details));
  const hasCall = ops.some((op) => op.type_name === CALL);

  const records = ops.map((op, i) =>
    toOperationRecord(
      {
        id: op.op_id,
        type: Number(op.type),
        type_name: op.type_name,
        source_account: op.source_account,
        source_account_muxed: op.source_account_muxed,
        details: details[i],
        // Horizon marks every op of a failed tx failed, whatever its own code says
        successful,
        closedAt: createdAt,
        txHash: tx.tx_hash,
      },
      transfers
        .filter((t) => t.op_index === op.op_index && t.kind === "transfer")
        .map((t): OpTransfer => ({
          asset: t.asset,
          from: t.from_address,
          to: t.to_address,
          amount: t.amount,
          position: Number(t.position),
        })),
    ),
  );

  // contract events only for contract calls, as the page shows them today
  // (classic ops emit events too, they're on the Effects tab as movements)
  const decodedEvents: DecodedContractEvent[] = hasCall
    ? events.map((e) => ({
        contractId: e.contract_id || null,
        topics: (e.topics ?? []).map((t) => fromScJson(parse(t))),
        data: fromScJson(parse(e.data)),
      }))
    : [];

  const assets = new Map<string, AssetRef | undefined>();
  const assetOf = (t: ChTxTransfer) => {
    if (!t.asset || !t.contract_id) return undefined;
    const key = `${t.asset} ${t.contract_id}`;
    if (!assets.has(key)) assets.set(key, verifiedStellarAsset(t.asset, t.contract_id, passphrase));
    return assets.get(key);
  };
  const byIndex = new Map(ops.map((op, i) => [Number(op.op_index), records[i]]));
  const movements: TokenMovement[] = sorobanTokenMovements(decodedEvents, passphrase);
  for (const t of transfers) {
    const record = byIndex.get(Number(t.op_index));
    if (!MOVES.has(t.kind) || !record || (record.type as string) === CALL) continue;
    const labels = labelsFor(record, t);
    const base = {
      amount: t.amount,
      token: t.contract_id,
      asset: assetOf(t),
      kind: t.kind as TokenMovement["kind"],
    };
    if (t.from_address) {
      movements.push({ ...base, account: t.from_address, direction: "out", label: labels.out });
    }
    if (t.to_address) {
      movements.push({ ...base, account: t.to_address, direction: "in", label: labels.in });
    }
  }

  return {
    hash,
    ledger: Number(tx.ledger_sequence),
    createdAt,
    successful,
    sourceAccount: tx.source_account,
    sequence: String(tx.account_sequence),
    feeCharged: String(tx.fee_charged),
    maxFee: String(tx.max_fee),
    feeAccount: tx.fee_account || tx.source_account,
    innerHash: tx.inner_tx_hash && tx.inner_tx_hash !== NO_HASH ? tx.inner_tx_hash : null,
    // hash and return memos are stored as hex already
    memo: tx.memo_type && tx.memo_type !== "none" ? { label: `Memo (${tx.memo_type})`, text: tx.memo } : null,
    error: successful ? null : txErrorFromCodes(Number(tx.result_code), ops.map((op) => op.result_code)),
    ops: records,
    invocations: ops.map((op, i) => (op.type_name === CALL ? invocationOf(details[i]) : null)),
    returnValues: ops.map((op) => (op.type_name === CALL ? returnValueOf(op.return_value) : null)),
    events: decodedEvents,
    feeEvents: feeEventsOf(transfers),
    flow: indexedFlow(
      ops.map((op, i) => ({ type: op.type_name, source: op.source_account || null, details: details[i] })),
      tx.source_account,
    ),
    effects: [],
    movements,
    notes: successful ? records.map(noteOf).filter((n) => n !== null) : [],
    preconditions: null,
    resources: null,
    raw: null,
  };
}
