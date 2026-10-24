import "server-only";
import { chQuery } from "./client";
import { toTxDetail, type ChTxEvent, type ChTxOp, type ChTxRow, type ChTxTransfer } from "./txView";
import type { TxDetail } from "../transactions";

/**
 * A transaction by hash, a fee bump's inner hash too. Null when the indexer
 * doesn't have it (anything before go-live), so the caller can ask Horizon.
 */
export async function indexedTransactionDetail(
  hash: string,
  passphrase: string,
): Promise<TxDetail | null> {
  const wanted = hash.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(wanted)) return null;

  // tx_by_hash is keyed by the first 8 bytes; the full hash settles collisions
  const [tx] = await chQuery<ChTxRow>(
    `SELECT ledger_sequence, tx_index, lower(hex(hash)) AS tx_hash, lower(hex(inner_hash)) AS inner_tx_hash,
            toUnixTimestamp(closed_at) AS closed_ts, source_account, account_sequence, fee_account,
            max_fee, fee_charged, successful, result_code, memo_type, memo
     FROM transactions
     WHERE (ledger_sequence, tx_index) IN (
       SELECT ledger_sequence, tx_index FROM tx_by_hash WHERE prefix = unhex({prefix:String}))
       AND (hash = unhex({hash:String}) OR inner_hash = unhex({hash:String}))
     LIMIT 1`,
    { prefix: wanted.slice(0, 16), hash: wanted },
  );
  if (!tx) return null;

  const at = { ledger: tx.ledger_sequence, tx: tx.tx_index };
  const where = "ledger_sequence = {ledger:UInt32} AND tx_index = {tx:UInt32}";
  const [ops, events, transfers] = await Promise.all([
    chQuery<ChTxOp>(
      `SELECT toString(id) AS op_id, op_index, type, type_name, source_account, source_account_muxed,
              details, result_code, return_value
       FROM operations WHERE ${where} ORDER BY op_index`,
      at,
    ),
    chQuery<ChTxEvent>(
      `SELECT op_index, contract_id, topics, data FROM events
       WHERE ${where} AND op_index >= 0 ORDER BY op_index, event_index`,
      at,
    ),
    chQuery<ChTxTransfer>(
      `SELECT op_index, position, kind, asset, contract_id, from_address, to_address,
              toString(amount) AS amount
       FROM token_transfers WHERE ${where} ORDER BY op_index, position`,
      at,
    ),
  ]);
  return toTxDetail(wanted, tx, ops, events, transfers, passphrase);
}
