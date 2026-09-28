import "server-only";
import { cache } from "react";
import { Horizon, xdr } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";

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
  successful: boolean;
  pagingToken: string;
}

// envelope op bodies are camelCase ("invokeHostFunction"), Horizon uses snake_case
function envelopeOpTypes(envelopeXdr: string): string[] {
  try {
    const env = xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
    const tx =
      env.switch() === xdr.EnvelopeType.envelopeTypeTxFeeBump()
        ? env.feeBump().tx().innerTx().v1().tx()
        : env.switch() === xdr.EnvelopeType.envelopeTypeTxV0()
          ? env.v0().tx()
          : env.v1().tx();
    return tx
      .operations()
      .map((op) => op.body().switch().name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`));
  } catch {
    return [];
  }
}

/** Newest transactions first, failed included. `cursor` pages to older ones. */
export async function getRecentTransactions(cursor?: string, limit = 25): Promise<TxRow[]> {
  let call = (await horizon()).transactions().order("desc").limit(limit).includeFailed(true);
  if (cursor) call = call.cursor(cursor);
  const page = await call.call();
  return page.records.map((r) => ({
    hash: r.hash,
    ledger: r.ledger_attr,
    createdAt: r.created_at,
    source: r.source_account,
    feeStroops: String(r.fee_charged),
    opCount: r.operation_count,
    opTypes: envelopeOpTypes(r.envelope_xdr),
    successful: r.successful,
    pagingToken: r.paging_token,
  }));
}
