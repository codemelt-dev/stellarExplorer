import "server-only";
import { cache } from "react";
import { Horizon, xdr } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";
import { activeNetwork } from "./network";
import { getTransactionMetaXdr } from "./rpc";
import { getArchivedMetaXdr } from "./archive";
import { filterTypes, matchesFilter, type HistoryFilter } from "./opFilters";
import { transactionFlow, type TxFlow } from "./txFlow";
import {
  decodeTxError,
  getFeeEvents,
  getSorobanEvents,
  getSorobanReturnValue,
  memoDisplay,
  parsePreconditions,
  parseSorobanInvocation,
  parseSorobanResources,
  sorobanTokenMovements,
  type DecodedContractEvent,
  type DecodedTxError,
  type DecodedValue,
  type FeeEvents,
  type SorobanInvocation,
  type SorobanResources,
  type TokenMovement,
  type TxPreconditions,
} from "./xdrDecode";
import { withIndexer } from "./indexer/client";
import { indexedRecentTransactions } from "./indexer/transactions";

export type TransactionRecord = Horizon.ServerApi.TransactionRecord;
export type OperationRecord = Horizon.ServerApi.OperationRecord;

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

/** 404 = missing; 400 = malformed id - both render as "not found" upstream. */
function isHorizon404(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return false;
  }
  const status = (error as { response?: { status?: number } }).response?.status;
  return status === 404 || status === 400;
}

/** Transaction by hash. Throws NotFoundError on 404. Deduped per request. */
export const getTransaction = cache(
  async (hash: string): Promise<TransactionRecord> => {
    try {
      return await (await horizon()).transactions().transaction(hash).call();
    } catch (error) {
      if (isHorizon404(error)) throw new NotFoundError("Transaction");
      throw error;
    }
  },
);

export type EffectRecord = Horizon.ServerApi.EffectRecord;

// effects = per-account state changes (credits, debits, trades, trustlines).
// Failed txs have none, they changed nothing
export const getTransactionEffects = cache(
  async (hash: string): Promise<EffectRecord[]> => {
    try {
      const page = await (await horizon())
        .effects()
        .forTransaction(hash)
        .limit(200)
        .call();
      return page.records;
    } catch {
      return [];
    }
  },
);

/** All operations of a transaction (a tx holds at most 100 ops). */
export const getTransactionOperations = cache(
  async (hash: string): Promise<OperationRecord[]> => {
    try {
      const page = await (await horizon())
        .operations()
        .forTransaction(hash)
        .limit(200)
        .includeFailed(true)
        .call();
      return page.records;
    } catch (error) {
      if (isHorizon404(error)) throw new NotFoundError("Transaction");
      throw error;
    }
  },
);

/** The raw XDR behind a transaction, for the XDR tab. */
export interface TxRaw {
  signatures: string[];
  envelope: string;
  result: string;
  /** "" when no source still has it. */
  meta: string;
}

/** Everything the transaction page shows, whichever source it came from. */
export interface TxDetail {
  hash: string;
  ledger: number;
  createdAt: string;
  successful: boolean;
  sourceAccount: string;
  sequence: string;
  /** Stroops. */
  feeCharged: string;
  maxFee: string;
  feeAccount: string;
  /** Set on a fee bump: the hash of the transaction it wraps. */
  innerHash: string | null;
  memo: { label: string; text: string } | null;
  error: DecodedTxError | null;
  ops: OperationRecord[];
  /** Per operation, null for anything that isn't a contract call, deploy or upload. */
  invocations: Array<SorobanInvocation | null>;
  returnValues: Array<DecodedValue | null>;
  events: DecodedContractEvent[];
  feeEvents: FeeEvents | null;
  flow: TxFlow;
  effects: EffectRecord[];
  movements: TokenMovement[];
  // envelope only, null when the source doesn't keep the envelope
  preconditions: TxPreconditions | null;
  resources: SorobanResources | null;
  raw: TxRaw | null;
}

function isContractCall(op: OperationRecord): boolean {
  return (op.type as string) === "invoke_host_function";
}

// Horizon no longer returns result_meta_xdr: Stellar RPC, then the ledger
// archive. Only worth the round-trip for Soroban txs
async function resultMeta(
  tx: TransactionRecord,
  ops: OperationRecord[],
): Promise<string | undefined> {
  const fromHorizon = (tx as TransactionRecord & Record<string, unknown>)["result_meta_xdr"];
  if (typeof fromHorizon === "string") return fromHorizon;
  if (!ops.some(isContractCall)) return undefined;
  return (
    (await getTransactionMetaXdr(tx.hash)) ??
    (await getArchivedMetaXdr(tx.ledger_attr, tx.hash)) ??
    undefined
  );
}

/** Horizon records -> the page's view, decoding the envelope and meta. */
export function fromHorizon(
  tx: TransactionRecord,
  ops: OperationRecord[],
  effects: EffectRecord[],
  metaXdr: string | undefined,
  passphrase: string,
): TxDetail {
  const record = tx as TransactionRecord & Record<string, unknown>;
  const feeBump = record["fee_bump_transaction"] as { hash: string } | undefined;
  const innerTx = record["inner_transaction"] as { hash: string } | undefined;
  const returnValue = getSorobanReturnValue(metaXdr);
  const events = getSorobanEvents(metaXdr);
  return {
    hash: tx.hash,
    ledger: tx.ledger_attr,
    createdAt: tx.created_at,
    successful: tx.successful,
    sourceAccount: tx.source_account,
    sequence: tx.source_account_sequence,
    feeCharged: String(tx.fee_charged),
    maxFee: String(tx.max_fee),
    feeAccount: (record["fee_account"] as string | undefined) ?? tx.source_account,
    innerHash: feeBump && innerTx ? innerTx.hash : null,
    memo: memoDisplay(tx.memo_type, tx.memo),
    error: tx.successful ? null : decodeTxError(tx.result_xdr),
    ops,
    invocations: ops.map((op, i) =>
      isContractCall(op) ? parseSorobanInvocation(tx.envelope_xdr, i) : null,
    ),
    returnValues: ops.map((op) => (isContractCall(op) ? returnValue : null)),
    events,
    feeEvents: getFeeEvents(metaXdr),
    flow: envelopeFlow(tx.envelope_xdr, tx.source_account),
    effects,
    movements: sorobanTokenMovements(events, passphrase),
    preconditions: parsePreconditions(tx.envelope_xdr),
    resources: ops.some(isContractCall) ? parseSorobanResources(tx.envelope_xdr) : null,
    raw: {
      signatures: tx.signatures,
      envelope: tx.envelope_xdr,
      result: tx.result_xdr,
      meta: metaXdr ?? "",
    },
  };
}

async function horizonTransactionDetail(hash: string): Promise<TxDetail> {
  const [tx, ops, effects] = await Promise.all([
    getTransaction(hash),
    getTransactionOperations(hash),
    getTransactionEffects(hash),
  ]);
  const meta = await resultMeta(tx, ops);
  return fromHorizon(tx, ops, effects, meta, (await activeNetwork()).passphrase);
}

/** The transaction page's data. Throws NotFoundError when there's no such tx. */
export const getTransactionDetail = cache(
  (hash: string): Promise<TxDetail> => horizonTransactionDetail(hash),
);

export interface TxRow {
  hash: string;
  ledger: number;
  createdAt: string;
  source: string;
  feeStroops: string;
  opCount: number;
  /** Horizon-style snake_case op types, decoded from the envelope. */
  opTypes: string[];
  /** Who sent what to whom, from the main operation. */
  flow: TxFlow;
  successful: boolean;
  pagingToken: string;
}

export interface TxPage {
  rows: TxRow[];
  /** Paging token to continue from, null when there's nothing older. */
  nextCursor: string | null;
  /** Transactions looked at to fill this page (more than rows on filtered tabs). */
  scanned: number;
}

function envelopeOps(envelopeXdr: string): xdr.Operation[] {
  try {
    const env = xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
    const tx =
      env.switch() === xdr.EnvelopeType.envelopeTypeTxFeeBump()
        ? env.feeBump().tx().innerTx().v1().tx()
        : env.switch() === xdr.EnvelopeType.envelopeTypeTxV0()
          ? env.v0().tx()
          : env.v1().tx();
    return tx.operations();
  } catch {
    return [];
  }
}

/** From/to summary for one transaction, same decoding as the list rows. */
export function envelopeFlow(envelopeXdr: string, source: string): TxFlow {
  return transactionFlow(envelopeOps(envelopeXdr), source);
}

// envelope op bodies are camelCase ("invokeHostFunction"), Horizon uses snake_case
function opTypeOf(op: xdr.Operation): string {
  return op.body().switch().name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toTxRow(r: TransactionRecord, ops = envelopeOps(r.envelope_xdr)): TxRow {
  return {
    hash: r.hash,
    ledger: r.ledger_attr,
    createdAt: r.created_at,
    source: r.source_account,
    feeStroops: String(r.fee_charged),
    opCount: r.operation_count,
    opTypes: ops.map(opTypeOf),
    flow: transactionFlow(ops, r.source_account),
    successful: r.successful,
    pagingToken: r.paging_token,
  };
}

const PAGE_SIZE = 25;
// Horizon can't filter transactions by operation type, so filtered tabs scan
// newest-first batches and keep matches. Bounded so a rare type can't stall the page
const SCAN_BATCH = 200;
const SCAN_BATCHES = 3;

/** Newest transactions first, failed included. `cursor` pages to older ones. */
export async function getRecentTransactions(
  cursor?: string,
  filter: HistoryFilter = "all",
): Promise<TxPage> {
  // the indexer filters by op type in one query; Horizon has to scan for it
  return withIndexer(
    filter === "all" ? "recent transactions" : `recent transactions (${filter})`,
    () => indexedRecentTransactions(cursor, PAGE_SIZE, filterTypes(filter)),
    () => (filter === "all" ? latestTransactions(cursor) : scanRecentTransactions(cursor, filter)),
  );
}

async function latestTransactions(cursor: string | undefined): Promise<TxPage> {
  let call = (await horizon()).transactions().order("desc").limit(PAGE_SIZE).includeFailed(true);
  if (cursor) call = call.cursor(cursor);
  const rows = (await call.call()).records.map((r) => toTxRow(r));
  return {
    rows,
    nextCursor: rows.length === PAGE_SIZE ? rows[rows.length - 1].pagingToken : null,
    scanned: rows.length,
  };
}

async function scanRecentTransactions(
  cursor: string | undefined,
  filter: HistoryFilter,
): Promise<TxPage> {
  const server = await horizon();
  const rows: TxRow[] = [];
  let scanned = 0;
  let last = cursor;
  for (let i = 0; i < SCAN_BATCHES; i++) {
    let call = server.transactions().order("desc").limit(SCAN_BATCH).includeFailed(true);
    if (last) call = call.cursor(last);
    const { records } = await call.call();
    for (const r of records) {
      last = r.paging_token;
      scanned++;
      const ops = envelopeOps(r.envelope_xdr);
      if (!ops.some((op) => matchesFilter(opTypeOf(op), filter))) continue;
      const row = toTxRow(r, ops);
      rows.push(row);
      if (rows.length === PAGE_SIZE) return { rows, nextCursor: row.pagingToken, scanned };
    }
    if (records.length < SCAN_BATCH) return { rows, nextCursor: null, scanned };
  }
  return { rows, nextCursor: last ?? null, scanned };
}
