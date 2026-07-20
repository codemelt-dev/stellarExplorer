import "server-only";
import { cache } from "react";
import { Horizon } from "@stellar/stellar-sdk";
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
