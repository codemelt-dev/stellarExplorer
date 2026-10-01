import "server-only";
import { cache } from "react";
import { Horizon, xdr } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";
import { matchesFilter, type HistoryFilter } from "./opFilters";
import { transactionFlow, type TxFlow } from "./txFlow";

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
  const server = await horizon();

  if (filter === "all") {
    let call = server.transactions().order("desc").limit(PAGE_SIZE).includeFailed(true);
    if (cursor) call = call.cursor(cursor);
    const rows = (await call.call()).records.map((r) => toTxRow(r));
    return {
      rows,
      nextCursor: rows.length === PAGE_SIZE ? rows[rows.length - 1].pagingToken : null,
      scanned: rows.length,
    };
  }

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
