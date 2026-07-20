import "server-only";
import { cache } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";
import { NotFoundError } from "./transactions";

export type LedgerRecord = Horizon.ServerApi.LedgerRecord;
export type TxRecord = Horizon.ServerApi.TransactionRecord;

/** 404 = missing; 400 = malformed id - both render as "not found" upstream. */
function isHorizon404(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return false;
  }
  const status = (error as { response?: { status?: number } }).response?.status;
  return status === 404 || status === 400;
}

export const getLedger = cache(async (sequence: number): Promise<LedgerRecord> => {
  try {
    return await (await horizon()).ledgers().ledger(sequence).call() as unknown as LedgerRecord;
  } catch (error) {
    if (isHorizon404(error)) throw new NotFoundError("Ledger");
    throw error;
  }
});

export const getLedgerTransactions = cache(
  async (sequence: number): Promise<TxRecord[]> => {
    try {
      const page = await (await horizon())
        .transactions()
        .forLedger(sequence)
        .limit(200)
        .includeFailed(true)
        .call();
      return page.records;
    } catch (error) {
      if (isHorizon404(error)) throw new NotFoundError("Ledger");
      throw error;
    }
  },
);
