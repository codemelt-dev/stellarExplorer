import "server-only";
import { chQuery } from "./client";
import { OP_COLUMNS, toOpRecords, type ChOpRow } from "./accounts";
import { CONTRACT_TYPES, PAYMENT_TYPES, TRADE_TYPES } from "../opFilters";
import type { OperationRecord } from "../transactions";

// op type names are our own constants, never request input
const list = (types: ReadonlySet<string>) => `[${[...types].map((t) => `'${t}'`).join(",")}]`;

/**
 * The network's newest operations as Horizon records, a mix of kinds: the
 * newest `perKind` payments, trades, contract calls and others of the last two
 * ledgers, interleaved. Strictly newest-first would be all contract calls,
 * since they close every ledger, and the feed's other tabs would sit empty.
 * The table is sorted by ledger, so this reads only its tail.
 */
export async function indexedLatestOperations(perKind: number): Promise<OperationRecord[]> {
  const rows = await chQuery<ChOpRow>(
    `SELECT * FROM (
       SELECT ${OP_COLUMNS},
              multiIf(type_name IN {payments:Array(String)}, 1, type_name IN {trades:Array(String)}, 2,
                      type_name IN {contracts:Array(String)}, 3, 4) AS kind,
              row_number() OVER (PARTITION BY ledger_sequence, kind ORDER BY tx_index DESC, op_index DESC) AS nth
       FROM operations
       WHERE ledger_sequence >= (SELECT ledger_sequence FROM operations ORDER BY ledger_sequence DESC LIMIT 1) - 1)
     ORDER BY ledger_sequence DESC, nth ASC, kind ASC
     LIMIT {perKind:UInt32} BY kind`,
    {
      payments: list(PAYMENT_TYPES),
      trades: list(TRADE_TYPES),
      contracts: list(CONTRACT_TYPES),
      perKind,
    },
  );
  return toOpRecords(rows);
}
