import "server-only";
import { cache } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";
import { NotFoundError } from "./transactions";
import { withIndexer } from "./indexer/client";
import { parseCursor } from "./indexer/cursor";
import {
  indexedLedger,
  indexedLedgers,
  indexedLedgerTransactions,
} from "./indexer/ledgers";

/** 404 = missing; 400 = malformed id - both render as "not found" upstream. */
function isHorizon404(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return false;
  }
  const status = (error as { response?: { status?: number } }).response?.status;
  return status === 404 || status === 400;
}

export interface LedgerRow {
  sequence: number;
  hash: string;
  closedAt: string;
  txOk: number;
  txFailed: number;
  opCount: number;
  baseFeeStroops: number;
  protocol: number;
  pagingToken: string;
}

/** One transaction as a ledger page lists it. */
export interface LedgerTx {
  hash: string;
  successful: boolean;
  source: string;
  feeStroops: string;
  opCount: number;
}

function toLedgerRow(r: Horizon.ServerApi.LedgerRecord): LedgerRow {
  const l = r as typeof r & {
    successful_transaction_count?: number;
    failed_transaction_count?: number;
  };
  return {
    sequence: l.sequence,
    hash: l.hash,
    closedAt: l.closed_at,
    txOk: l.successful_transaction_count ?? 0,
    txFailed: l.failed_transaction_count ?? 0,
    opCount: l.operation_count,
    baseFeeStroops: l.base_fee_in_stroops,
    protocol: l.protocol_version,
    pagingToken: l.paging_token,
  };
}

export const getLedger = cache(async (sequence: number): Promise<LedgerRow> =>
  withIndexer(
    `ledger ${sequence}`,
    () => indexedLedger(sequence),
    async () => {
      try {
        const record = await (await horizon()).ledgers().ledger(sequence).call();
        return toLedgerRow(record as unknown as Horizon.ServerApi.LedgerRecord);
      } catch (error) {
        if (isHorizon404(error)) throw new NotFoundError("Ledger");
        throw error;
      }
    },
  ),
);

export const getLedgerTransactions = cache(
  async (sequence: number): Promise<LedgerTx[]> =>
    withIndexer(
      `ledger ${sequence} transactions`,
      () => indexedLedgerTransactions(sequence),
      async () => {
        try {
          const page = await (await horizon())
            .transactions()
            .forLedger(sequence)
            .limit(200)
            .includeFailed(true)
            .call();
          return page.records.map((t) => ({
            hash: t.hash,
            successful: t.successful,
            source: t.source_account,
            feeStroops: String(t.fee_charged),
            opCount: t.operation_count,
          }));
        } catch (error) {
          if (isHorizon404(error)) throw new NotFoundError("Ledger");
          throw error;
        }
      },
    ),
);

/** Newest ledgers first. `cursor` = paging token of the last row seen, for older pages. */
export async function getRecentLedgers(cursor?: string, limit = 25): Promise<LedgerRow[]> {
  return withIndexer(
    "recent ledgers",
    async () => {
      const before = cursor ? parseCursor(cursor) : null;
      if (cursor && !before) return null;
      return indexedLedgers(before?.ledger ?? null, limit);
    },
    async () => {
      let call = (await horizon()).ledgers().order("desc").limit(limit);
      if (cursor) call = call.cursor(cursor);
      const page = await call.call();
      return page.records.map(toLedgerRow);
    },
  );
}
