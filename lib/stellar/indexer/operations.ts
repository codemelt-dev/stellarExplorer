import "server-only";
import { chQuery } from "./client";
import { OP_COLUMNS, toOpRecords, type ChOpRow } from "./accounts";
import type { OperationRecord } from "../transactions";

/**
 * The network's newest operations, newest first, failed included, as Horizon
 * records. The table is sorted by ledger, so this reads only its tail.
 */
export async function indexedLatestOperations(limit: number): Promise<OperationRecord[]> {
  const rows = await chQuery<ChOpRow>(
    `SELECT ${OP_COLUMNS} FROM operations
     ORDER BY ledger_sequence DESC, tx_index DESC, op_index DESC LIMIT {limit:UInt32}`,
    { limit },
  );
  return toOpRecords(rows);
}
