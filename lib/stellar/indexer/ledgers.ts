import "server-only";
import { cache } from "react";
import { apiGet, chQuery } from "./client";
import { ledgerCursor } from "./cursor";
import type { LedgerRow, LedgerTx } from "../ledgers";

const MAX_UINT32 = 0xffffffff;

interface ChLedger {
  sequence: number;
  ledger_hash: string;
  closed_ts: number;
  tx_count: number;
  failed_tx_count: number;
  op_count: number;
  base_fee: number;
  protocol_version: number;
}

// closed_at goes out as a unix timestamp so its format and timezone can't drift
const LEDGER_COLUMNS =
  "sequence, lower(hex(hash)) AS ledger_hash, toUnixTimestamp(closed_at) AS closed_ts, " +
  "tx_count, failed_tx_count, op_count, base_fee, protocol_version";

function toLedgerRow(l: ChLedger): LedgerRow {
  const sequence = Number(l.sequence);
  const failed = Number(l.failed_tx_count);
  return {
    sequence,
    hash: l.ledger_hash,
    closedAt: new Date(Number(l.closed_ts) * 1000).toISOString(),
    // tx_count counts failed ones too
    txOk: Number(l.tx_count) - failed,
    txFailed: failed,
    opCount: Number(l.op_count),
    baseFeeStroops: Number(l.base_fee),
    protocol: Number(l.protocol_version),
    pagingToken: ledgerCursor(sequence),
  };
}

/** Newest first, older than `before`. Null when the indexer has none (before go-live). */
export async function indexedLedgers(
  before: number | null,
  limit: number,
): Promise<LedgerRow[] | null> {
  const rows = await chQuery<ChLedger>(
    `SELECT ${LEDGER_COLUMNS} FROM ledgers
     WHERE sequence < {before:UInt32} ORDER BY sequence DESC LIMIT {limit:UInt32}`,
    { before: before ?? MAX_UINT32, limit },
  );
  return rows.length ? rows.map(toLedgerRow) : null;
}

export const indexedLedger = cache(async (sequence: number): Promise<LedgerRow | null> => {
  const [row] = await chQuery<ChLedger>(
    `SELECT ${LEDGER_COLUMNS} FROM ledgers WHERE sequence = {sequence:UInt32}`,
    { sequence },
  );
  return row ? toLedgerRow(row) : null;
});

interface ChLedgerTx {
  tx_hash: string;
  successful: boolean | number;
  source_account: string;
  fee_charged: string;
  op_count: number;
}

/** A ledger's transactions in apply order. Null when the ledger itself isn't indexed. */
export async function indexedLedgerTransactions(sequence: number): Promise<LedgerTx[] | null> {
  // an unindexed ledger and an empty one both return no rows, so check the ledger first
  if (!(await indexedLedger(sequence))) return null;
  const rows = await chQuery<ChLedgerTx>(
    `SELECT lower(hex(hash)) AS tx_hash, successful, source_account, fee_charged, op_count
     FROM transactions WHERE ledger_sequence = {sequence:UInt32} ORDER BY tx_index`,
    { sequence },
  );
  return rows.map((t) => ({
    hash: t.tx_hash,
    successful: Boolean(t.successful),
    source: t.source_account,
    feeStroops: String(t.fee_charged),
    opCount: Number(t.op_count),
  }));
}

export interface ApiLedger {
  sequence: number;
  closed_at: string;
  tx_count: number;
  failed_tx_count: number;
  successful_op_count: number;
  base_fee: number;
  protocol_version: number;
  /** stroops, as a string */
  fee_pool: string;
}

// the state API has a ledger about 1s after it closes, ClickHouse 2 ledgers later
export async function indexedLiveLedgers(after: number | null, limit: number): Promise<ApiLedger[]> {
  const query: Record<string, string> = {
    select: "sequence,closed_at,tx_count,failed_tx_count,successful_op_count,base_fee,protocol_version,fee_pool",
    order: "sequence.desc",
    limit: String(limit),
  };
  if (after !== null) query.sequence = `gt.${after}`;
  return apiGet<ApiLedger>("ledgers", query);
}
