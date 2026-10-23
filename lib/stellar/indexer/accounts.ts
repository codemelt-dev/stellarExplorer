import "server-only";
import type { AccountView, BalanceLine } from "../accounts";
import type { OperationRecord } from "../transactions";
import { apiGet, chQuery } from "./client";
import { parseCursor, txCursor } from "./cursor";
import { horizonAmount, toOperationRecord, type OpTransfer } from "./opRecord";
import { parseDetails, tupleList } from "./transactions";

const MAX_UINT32 = 0xffffffff;
const MAX_INT64 = "9223372036854775807";
// transactions read per round, rounds per page. account_activity is ordered
// by account, so a round is one short index read
const SCAN_TXS = 500;
const MAX_ROUNDS = 4;
const PATH_PAYMENTS = new Set(["path_payment_strict_send", "path_payment_strict_receive"]);

interface ApiAccount {
  account_id: string;
  balance: string;
  seq_num: string;
  num_subentries: number;
  num_sponsored: number;
  num_sponsoring: number;
  flags: number;
  home_domain: string;
  master_weight: number;
  threshold_low: number;
  threshold_medium: number;
  threshold_high: number;
  signers: Array<{ key: string; weight: number }> | null;
}

interface ApiTrustline {
  asset: string;
  liquidity_pool_id: string | null;
  balance: string;
}

interface ApiDataEntry {
  name: string;
  value: string;
}

/** Current state from the API, shaped like Horizon's account. Null when the indexer doesn't have it. */
export async function indexedAccount(id: string): Promise<AccountView | null> {
  const byAccount = { account_id: `eq.${id}` };
  const [accounts, trustlines, data] = await Promise.all([
    apiGet<ApiAccount>("accounts", {
      ...byAccount,
      select:
        "account_id,balance,seq_num,num_subentries,num_sponsored,num_sponsoring,flags," +
        "home_domain,master_weight,threshold_low,threshold_medium,threshold_high,signers",
      limit: "1",
    }),
    apiGet<ApiTrustline>("trustlines", { ...byAccount, select: "asset,liquidity_pool_id,balance" }),
    apiGet<ApiDataEntry>("data_entries", { ...byAccount, select: "name,value" }),
  ]);
  const account = accounts[0];
  if (!account) return null;

  const balances = trustlines.map((line): BalanceLine => {
    const balance = horizonAmount(line.balance);
    if (line.liquidity_pool_id) {
      return { asset_type: "liquidity_pool_shares", liquidity_pool_id: line.liquidity_pool_id, balance };
    }
    const [code, issuer] = line.asset.split(":");
    return {
      asset_type: code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12",
      asset_code: code,
      asset_issuer: issuer,
      balance,
    };
  });
  balances.push({ asset_type: "native", balance: horizonAmount(account.balance) });

  const flag = (bit: number) => (account.flags & bit) !== 0;
  return {
    id: account.account_id,
    home_domain: account.home_domain || undefined,
    balances,
    // Horizon lists the master key among the signers too
    signers: [
      ...(account.signers ?? []).map(({ key, weight }) => ({ key, weight })),
      { key: account.account_id, weight: account.master_weight },
    ],
    thresholds: {
      low_threshold: account.threshold_low,
      med_threshold: account.threshold_medium,
      high_threshold: account.threshold_high,
    },
    flags: {
      auth_required: flag(1),
      auth_revocable: flag(2),
      auth_immutable: flag(4),
      auth_clawback_enabled: flag(8),
    },
    sequence: account.seq_num,
    subentry_count: account.num_subentries,
    num_sponsoring: account.num_sponsoring,
    num_sponsored: account.num_sponsored,
    data_attr: Object.fromEntries(data.map((entry) => [entry.name, entry.value])),
  };
}

interface TxKey {
  ledger_sequence: number;
  tx_index: number;
}

// account_activity roles, a bitmask per transaction
const OP_SOURCE = 4;
const NAMED = 8;

interface ChAccountOp extends TxKey {
  // not "id": ClickHouse would read the alias in WHERE
  op_id: string;
  op_index: number;
  type: number;
  type_name: string;
  source_account: string;
  source_account_muxed: string;
  details: unknown;
  successful: boolean | number;
  closed_ts: number;
}

interface ChTransfer extends TxKey {
  op_index: number;
  asset: string;
  from_address: string;
  to_address: string;
  amount: string;
  position: number;
}

export interface IndexedOpsPage {
  /** newest first */
  records: OperationRecord[];
  /** where the next page in the same direction starts */
  cursor: string;
  /** nothing further that way in the indexer. Older history may still be on Horizon */
  exhausted: boolean;
}

/**
 * An account's operations: the ones it sent, or that name it (destination,
 * trustor, contract args...). Newest first, or the next ones up after `cursor`
 * when `newer`. Null when the indexer has none of the account's history there.
 */
export async function indexedAccountOperations(
  account: string,
  options: { cursor?: string; newer: boolean; limit: number; types?: ReadonlySet<string> },
): Promise<IndexedOpsPage | null> {
  const { cursor, newer, limit, types } = options;
  const at = cursor ? parseCursor(cursor) : null;
  if (cursor && !at) return null;

  // a cursor from a Horizon page, older than anything indexed for this
  // account: going up from it would skip what lies between
  if (newer && at) {
    const below = await chQuery(
      `SELECT 1 FROM account_activity
       WHERE account = {account:String} AND (ledger_sequence, tx_index) <= ({ledger:UInt32}, {tx:UInt32})
       LIMIT 1`,
      { account, ledger: at.ledger, tx: at.txIndex },
    );
    if (below.length === 0) return null;
  }

  const dir = newer ? "ASC" : "DESC";
  // op type names are our own constants (opFilters.ts)
  const typeParam: Record<string, string> = types
    ? { types: `[${[...types].map((t) => `'${t}'`).join(",")}]` }
    : {};
  let txBound = at ?? { ledger: newer ? 0 : MAX_UINT32, txIndex: newer ? 0 : MAX_UINT32 };
  let opBound = cursor ?? (newer ? "0" : MAX_INT64);
  let scannedAll = false;
  let scannedAny = false;
  const found: ChAccountOp[] = [];

  for (let round = 0; round < MAX_ROUNDS && found.length < limit && !scannedAll; round++) {
    const txs = await chQuery<TxKey & { roles: number }>(
      `SELECT ledger_sequence, tx_index, groupBitOr(roles) AS roles FROM account_activity
       WHERE account = {account:String}
         AND (ledger_sequence, tx_index) ${newer ? ">=" : "<="} ({ledger:UInt32}, {tx:UInt32})
       GROUP BY ledger_sequence, tx_index
       ORDER BY ledger_sequence ${dir}, tx_index ${dir}
       LIMIT {scan:UInt32}`,
      { account, ledger: txBound.ledger, tx: txBound.txIndex, scan: SCAN_TXS },
    );
    if (txs.length < SCAN_TXS) scannedAll = true;
    if (txs.length === 0) break;
    scannedAny = true;

    // Horizon's idea of an account's operations: ones it sent, ones naming it
    // as a value (an issuer inside "CODE:ISSUER" doesn't count), the ones it
    // sponsors, and payments to a muxed M... address of it, which the text
    // can't match
    const opSource = txs.filter((tx) => Number(tx.roles) & OP_SOURCE);
    const named = txs.filter((tx) => Number(tx.roles) & NAMED);
    const involves = [
      "source_account = {account:String}",
      "position(details, {quoted:String}) > 0",
      ...(opSource.length
        ? [
            `(ledger_sequence, tx_index) IN (
               SELECT ledger_sequence, tx_index FROM operations
               WHERE (ledger_sequence, tx_index) IN (${tupleList(opSource)})
                 AND type_name = 'begin_sponsoring_future_reserves' AND source_account = {account:String})`,
          ]
        : []),
      ...(named.length
        ? [`((ledger_sequence, tx_index) IN (${tupleList(named)}) AND match(details, '"(destination|from)":"M'))`]
        : []),
    ].join(" OR ");

    found.push(
      ...(await chQuery<ChAccountOp>(
        `SELECT toString(id) AS op_id, ledger_sequence, tx_index, op_index, type, type_name,
                source_account, source_account_muxed, details, successful,
                toUnixTimestamp(closed_at) AS closed_ts
         FROM operations
         WHERE (ledger_sequence, tx_index) IN (${tupleList(txs)})
           AND id ${newer ? ">" : "<"} {after:Int64}
           AND (${involves})
           ${types ? "AND type_name IN {types:Array(String)}" : ""}
         ORDER BY id ${dir}
         LIMIT {limit:UInt32}`,
        { account, quoted: `"${account}"`, after: opBound, limit: limit - found.length, ...typeParam },
      )),
    );

    // the next round starts past the last transaction read
    const last = txs[txs.length - 1];
    const ledger = Number(last.ledger_sequence);
    const txIndex = Number(last.tx_index);
    txBound = { ledger, txIndex };
    opBound = newer ? txCursor(ledger, txIndex + 1) : txCursor(ledger, txIndex);
  }
  if (!scannedAny) return null;

  const full = found.length === limit;
  const records = await toRecords(found);
  return {
    records: newer ? records.reverse() : records,
    cursor: full ? found[found.length - 1].op_id : opBound,
    exhausted: scannedAll && !full,
  };
}

// tx hashes for the rows, and for path payments the transfers that say what moved
async function toRecords(ops: ChAccountOp[]): Promise<OperationRecord[]> {
  if (ops.length === 0) return [];
  const key = (row: TxKey) => `${row.ledger_sequence}:${row.tx_index}`;
  const unique = (rows: ChAccountOp[]) => [...new Map(rows.map((row) => [key(row), row])).values()];
  const paths = ops.filter((op) => PATH_PAYMENTS.has(op.type_name));

  const [hashes, transfers] = await Promise.all([
    chQuery<TxKey & { tx_hash: string }>(
      `SELECT ledger_sequence, tx_index, lower(hex(hash)) AS tx_hash FROM transactions
       WHERE (ledger_sequence, tx_index) IN (${tupleList(unique(ops))})`,
    ),
    paths.length
      ? chQuery<ChTransfer>(
          `SELECT ledger_sequence, tx_index, op_index, asset, from_address, to_address,
                  toString(amount) AS amount, position
           FROM token_transfers
           WHERE (ledger_sequence, tx_index) IN (${tupleList(unique(paths))}) AND kind = 'transfer'`,
        )
      : Promise.resolve([] as ChTransfer[]),
  ]);

  const hashOf = new Map(hashes.map((row) => [key(row), row.tx_hash]));
  const transfersOf = new Map<string, OpTransfer[]>();
  for (const row of transfers) {
    const opKey = `${key(row)}:${row.op_index}`;
    const list = transfersOf.get(opKey) ?? [];
    list.push({
      asset: row.asset,
      from: row.from_address,
      to: row.to_address,
      amount: row.amount,
      position: Number(row.position),
    });
    transfersOf.set(opKey, list);
  }

  return ops.map((op) =>
    toOperationRecord(
      {
        id: op.op_id,
        type: Number(op.type),
        type_name: op.type_name,
        source_account: op.source_account,
        source_account_muxed: op.source_account_muxed,
        details: parseDetails(op.details),
        successful: Boolean(op.successful),
        closedAt: new Date(Number(op.closed_ts) * 1000).toISOString(),
        txHash: hashOf.get(key(op)) ?? "",
      },
      transfersOf.get(`${key(op)}:${op.op_index}`) ?? [],
    ),
  );
}
