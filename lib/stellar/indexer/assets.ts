import "server-only";
import { apiGet, chQuery } from "./client";

// asset tables are rebuilt once a day from current state (about 00:15 UTC)

export interface IndexedAsset {
  /** "native", "CODE:ISSUER", or a contract id for tokens that only exist on Soroban. */
  asset: string;
  holders: number;
  /** Base units as a digit string. */
  supply: string;
}

interface ChAsset {
  asset: string;
  holders: string | number;
  supply: string | number;
}

const toAsset = (r: ChAsset): IndexedAsset => ({
  asset: r.asset,
  holders: Number(r.holders),
  supply: String(r.supply),
});

/** Assets by number of holders. `after` is the last row already shown. */
export async function indexedAssets(
  after: { holders: number; asset: string } | null,
  limit: number,
): Promise<IndexedAsset[]> {
  const rows = after
    ? await chQuery<ChAsset>(
        `SELECT asset, holders, supply FROM assets
         WHERE (holders, asset) < ({holders:UInt64}, {asset:String})
         ORDER BY holders DESC, asset DESC LIMIT {limit:UInt32}`,
        { holders: after.holders, asset: after.asset, limit },
      )
    : await chQuery<ChAsset>(
        `SELECT asset, holders, supply FROM assets
         ORDER BY holders DESC, asset DESC LIMIT {limit:UInt32}`,
        { limit },
      );
  return rows.map(toAsset);
}

export async function indexedAsset(asset: string): Promise<IndexedAsset | null> {
  const [row] = await chQuery<ChAsset>(
    `SELECT asset, holders, supply FROM assets WHERE asset = {asset:String}`,
    { asset },
  );
  return row ? toAsset(row) : null;
}

export interface IndexedHolder {
  rank: number;
  holder: string;
  /** Base units as a digit string. */
  balance: string;
}

/** Largest holders of an asset (the indexer keeps the top 500, 1,000 for XLM). */
export async function indexedTopHolders(asset: string, limit: number): Promise<IndexedHolder[]> {
  const rows = await chQuery<{ rank: number; holder: string; balance: string | number }>(
    `SELECT rank, holder, balance FROM top_holders
     WHERE asset = {asset:String} ORDER BY rank LIMIT {limit:UInt32}`,
    { asset, limit },
  );
  return rows.map((r) => ({ rank: Number(r.rank), holder: r.holder, balance: String(r.balance) }));
}

export interface IndexedHolderLink {
  /** The two holders, in address order. */
  a: string;
  b: string;
  /** Transfers between them, either way. */
  transfers: number;
}

const HOLDER_KEY = /^[GC][A-Z2-7]{55}$/;

/**
 * Pairs of the given holders that moved the asset between each other in the
 * last `days`. Each transfer is stored once per side, so it is counted by its
 * position, not by row.
 */
export async function indexedHolderLinks(
  asset: string,
  holders: string[],
  days: number,
): Promise<IndexedHolderLink[]> {
  const keys = holders.filter((h) => HOLDER_KEY.test(h));
  if (keys.length < 2) return [];
  const rows = await chQuery<{ a: string; b: string; transfers: string | number }>(
    `WITH (SELECT max(sequence) FROM ledgers) AS tip
     SELECT least(account, counterparty) AS a, greatest(account, counterparty) AS b,
            uniqExact(ledger_sequence, tx_index, op_index, position) AS transfers
     FROM transfers_by_account
     WHERE account IN {holders:Array(String)} AND has({holders:Array(String)}, counterparty)
       AND account != counterparty AND asset = {asset:String} AND kind = 'transfer'
       AND ledger_sequence > tip - {days:UInt32} * {perDay:UInt32}
     GROUP BY a, b`,
    { holders: `[${keys.map((h) => `'${h}'`).join(",")}]`, asset, days, perDay: LEDGERS_PER_DAY },
  );
  return rows.map((r) => ({ a: r.a, b: r.b, transfers: Number(r.transfers) }));
}

export interface IndexedListedAsset {
  code: string;
  issuer: string;
  holders: number;
  homeDomain: string;
}

/** Most-held issued assets whose issuer names a home domain (where the toml lives). */
export async function indexedListedAssets(limit: number): Promise<IndexedListedAsset[]> {
  const rows = await chQuery<{ code: string; issuer: string; holders: string | number; home_domain: string }>(
    `SELECT code, issuer, holders, home_domain FROM assets
     WHERE kind = 'classic' AND home_domain != ''
     ORDER BY holders DESC LIMIT {limit:UInt32}`,
    { limit },
  );
  return rows.map((r) => ({
    code: r.code,
    issuer: r.issuer,
    holders: Number(r.holders),
    homeDomain: r.home_domain,
  }));
}

export interface IndexedTokenActivity {
  contractId: string;
  /** Distinct accounts that sent the token in the last 7 days. */
  senders: number;
  transfers: number;
  /** Distinct senders per day, oldest first, 7 entries. */
  dailySenders: number[];
}

const LEDGERS_PER_DAY = 17_280;

/**
 * Transfer activity over the last 7 days (7 x 17,280 ledgers back from the
 * tip), by the tokens' contract ids. Classic assets have one too, deployed or
 * not, and their transfers are recorded under it.
 */
export async function indexedTokenActivity(contractIds: string[]): Promise<IndexedTokenActivity[]> {
  if (!contractIds.length) return [];
  const rows = await chQuery<{
    contract_id: string;
    senders: string | number;
    transfers: string | number;
    days: Array<[number | string, number | string]>;
  }>(
    `WITH (SELECT max(sequence) FROM ledgers) AS tip
     SELECT contract_id, uniqExactMerge(s) AS senders, sum(n) AS transfers,
            groupArray((back, finalizeAggregation(s))) AS days
     FROM (
       SELECT contract_id, intDiv(tip - ledger_sequence, {perDay:UInt32}) AS back,
              count() AS n, uniqExactState(from_address) AS s
       FROM token_transfers
       WHERE contract_id IN {ids:Array(String)} AND kind = 'transfer'
         AND ledger_sequence > tip - 7 * {perDay:UInt32}
       GROUP BY contract_id, back)
     GROUP BY contract_id`,
    { ids: `[${contractIds.map((id) => `'${id}'`).join(",")}]`, perDay: LEDGERS_PER_DAY },
  );
  return rows.map((r) => {
    const daily = new Array<number>(7).fill(0);
    for (const [back, senders] of r.days) {
      const b = Number(back);
      if (b >= 0 && b < 7) daily[6 - b] = Number(senders);
    }
    return {
      contractId: r.contract_id,
      senders: Number(r.senders),
      transfers: Number(r.transfers),
      dailySenders: daily,
    };
  });
}

/**
 * Mid price of an asset in XLM from the order book's best bid and ask. Null
 * when a side is empty or the spread is too wide to call it a price.
 */
export async function indexedXlmPrice(asset: string): Promise<number | null> {
  const levels = await apiGet<{ side: "ask" | "bid"; price: string }>("rpc/order_book", {
    base: asset,
    counter: "native",
    depth: "1",
  });
  const ask = Number(levels.find((l) => l.side === "ask")?.price);
  const bid = Number(levels.find((l) => l.side === "bid")?.price);
  if (!(ask > 0) || !(bid > 0) || ask / bid > 1.2) return null;
  return (ask + bid) / 2;
}
