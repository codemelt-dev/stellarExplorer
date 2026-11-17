import "server-only";
import { chQuery } from "./client";
import { parseCursor, txCursor } from "./cursor";
import { indexedFlow, type IndexedOp } from "./details";
import { CONTRACT_TYPES } from "../opFilters";
import type { TxPage, TxRow } from "../transactions";

const MAX_UINT32 = 0xffffffff;

interface ChTx {
  ledger_sequence: number;
  tx_index: number;
  tx_hash: string;
  closed_ts: number;
  successful: boolean | number;
  source_account: string;
  fee_charged: string;
  op_count: number;
}

interface ChOp {
  ledger_sequence: number;
  tx_index: number;
  type_name: string;
  source_account: string;
  details: unknown;
}

// details is a JSON string in ClickHouse
export function parseDetails(details: unknown): unknown {
  if (typeof details !== "string") return details;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

const TX_COLUMNS =
  "ledger_sequence, tx_index, lower(hex(hash)) AS tx_hash, " +
  "toUnixTimestamp(closed_at) AS closed_ts, successful, source_account, fee_charged, op_count";

// (ledger, tx) pairs as a SQL tuple list. Built only from integers the indexer
// returned, checked here, so nothing from the request reaches the query text
export function tupleList(txs: Array<{ ledger_sequence: number; tx_index: number }>): string {
  return txs
    .map((t) => {
      const ledger = Number(t.ledger_sequence);
      const tx = Number(t.tx_index);
      if (!Number.isInteger(ledger) || !Number.isInteger(tx)) throw new Error("bad tx key");
      return `(${ledger},${tx})`;
    })
    .join(",");
}

// protocol 20, the first ledger with contract operations. The contract tab
// stops looking there instead of reading back to 2015
const FIRST_SOROBAN_LEDGER = 50_457_424;

/**
 * Newest transactions first, failed included. `cursor` is the paging token of
 * the last row seen. With `types`, only transactions holding an operation of
 * one of those types. Null when the indexer has nothing there.
 *
 * ClickHouse can't seek on a (ledger, tx) pair, only on ledger_sequence, so
 * every query here bounds it on its own: an inner query finds the ledger a
 * page reaches back to, the outer one reads just those ledgers.
 */
export async function indexedRecentTransactions(
  cursor: string | undefined,
  limit: number,
  types?: ReadonlySet<string>,
): Promise<TxPage | null> {
  const before = cursor ? parseCursor(cursor) : null;
  if (cursor && !before) return null;
  const at = { ledger: before?.ledger ?? MAX_UINT32, tx: before?.txIndex ?? MAX_UINT32, limit };

  const txs = types
    ? await chQuery<ChTx>(
        // the newest `limit` ledgers with a match hold at least `limit`
        // matching transactions, however many matching ops each one has
        `WITH page AS (
           SELECT ledger_sequence, tx_index FROM operations
           WHERE type_name IN {types:Array(String)} AND ledger_sequence <= {ledger:UInt32}
             AND ledger_sequence >= (SELECT ifNull(minOrNull(ledger_sequence), {max:UInt32}) FROM (
                   SELECT ledger_sequence FROM operations
                   WHERE type_name IN {types:Array(String)}
                     AND ledger_sequence >= {floor:UInt32} AND ledger_sequence < {ledger:UInt32}
                   ORDER BY ledger_sequence DESC LIMIT 1 BY ledger_sequence LIMIT {limit:UInt32}))
             AND (ledger_sequence, tx_index) < ({ledger:UInt32}, {tx:UInt32})
           GROUP BY ledger_sequence, tx_index
           ORDER BY ledger_sequence DESC, tx_index DESC LIMIT {limit:UInt32})
         SELECT ${TX_COLUMNS} FROM transactions
         WHERE ledger_sequence >= (SELECT ifNull(minOrNull(ledger_sequence), {max:UInt32}) FROM page)
           AND ledger_sequence <= {ledger:UInt32}
           AND (ledger_sequence, tx_index) IN (SELECT ledger_sequence, tx_index FROM page)
         ORDER BY ledger_sequence DESC, tx_index DESC`,
        {
          ...at,
          max: MAX_UINT32,
          floor: [...types].every((t) => CONTRACT_TYPES.has(t)) ? FIRST_SOROBAN_LEDGER : 0,
          // op type names are our own constants (opFilters.ts)
          types: `[${[...types].map((t) => `'${t}'`).join(",")}]`,
        },
      )
    : await chQuery<ChTx>(
        `SELECT ${TX_COLUMNS} FROM transactions
         WHERE ledger_sequence <= {ledger:UInt32}
           AND ledger_sequence >= (SELECT ifNull(minOrNull(ledger_sequence), {max:UInt32}) FROM (
                 SELECT ledger_sequence FROM transactions WHERE ledger_sequence < {ledger:UInt32}
                 ORDER BY ledger_sequence DESC LIMIT {limit:UInt32}))
           AND (ledger_sequence, tx_index) < ({ledger:UInt32}, {tx:UInt32})
         ORDER BY ledger_sequence DESC, tx_index DESC LIMIT {limit:UInt32}`,
        { ...at, max: MAX_UINT32 },
      );
  if (txs.length === 0) return null;

  const ops = await chQuery<ChOp>(
    `SELECT ledger_sequence, tx_index, type_name, source_account, details FROM operations
     WHERE ledger_sequence >= {fromLedger:UInt32} AND ledger_sequence <= {toLedger:UInt32}
       AND (ledger_sequence, tx_index) IN (${tupleList(txs)})
     ORDER BY ledger_sequence, tx_index, op_index`,
    { fromLedger: txs[txs.length - 1].ledger_sequence, toLedger: txs[0].ledger_sequence },
  );
  const opsByTx = new Map<string, IndexedOp[]>();
  for (const op of ops) {
    const key = `${op.ledger_sequence}:${op.tx_index}`;
    const list = opsByTx.get(key) ?? [];
    list.push({
      type: op.type_name,
      source: op.source_account || null,
      details: parseDetails(op.details),
    });
    opsByTx.set(key, list);
  }

  const rows: TxRow[] = txs.map((t) => {
    const ledger = Number(t.ledger_sequence);
    const txIndex = Number(t.tx_index);
    const txOps = opsByTx.get(`${t.ledger_sequence}:${t.tx_index}`) ?? [];
    return {
      hash: t.tx_hash,
      ledger,
      createdAt: new Date(Number(t.closed_ts) * 1000).toISOString(),
      source: t.source_account,
      feeStroops: String(t.fee_charged),
      opCount: Number(t.op_count),
      opTypes: txOps.map((op) => op.type),
      flow: indexedFlow(txOps, t.source_account),
      successful: Boolean(t.successful),
      pagingToken: txCursor(ledger, txIndex),
    };
  });
  // always offer an older page, an empty one falls back to Horizon
  return { rows, nextCursor: rows[rows.length - 1].pagingToken, scanned: rows.length };
}
