import "server-only";
import { chQuery } from "./client";

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
