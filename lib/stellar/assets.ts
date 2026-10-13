import "server-only";
import { cache } from "react";
import { Asset, Horizon } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";
import { NotFoundError } from "./transactions";
import { assetKey, fromAssetKey, type AssetIdentity } from "./assetId";
import { indexerActive, withIndexer } from "./indexer/client";
import {
  indexedAsset,
  indexedAssets,
  indexedTopHolders,
  type IndexedHolder,
} from "./indexer/assets";

export type AssetRecord = Horizon.ServerApi.AssetRecord;

/** Assets matching a code, most-held first. */
export const searchAssetsByCode = cache(
  async (code: string): Promise<AssetRecord[]> => {
    try {
      const page = await (await horizon())
        .assets()
        .forCode(code)
        .order("desc")
        .limit(10)
        .call();
      return page.records;
    } catch {
      return [];
    }
  },
);

export interface AssetSummary {
  identity: AssetIdentity;
  holders: number;
  /** Base units as a digit string: stroops for lumens and issued assets. */
  supply: string;
}

export interface AssetDirectoryPage {
  rows: AssetSummary[];
  /** Rank of the first row, 1-based. */
  firstRank: number;
  nextCursor: string | null;
}

const DIRECTORY_PAGE = 50;

/**
 * Assets ranked by holders, from the indexer. Null where there is none
 * (testnet); throws when it is there but fails.
 * `cursor` is "<rank>.<holders>.<asset key>" of the last row shown.
 */
export async function getAssetDirectory(cursor?: string): Promise<AssetDirectoryPage | null> {
  if (!(await indexerActive())) return null;
  let after: { rank: number; holders: number; asset: string } | null = null;
  if (cursor) {
    const [rank, holders, ...rest] = cursor.split(".");
    after = { rank: Number(rank), holders: Number(holders), asset: rest.join(".") };
    if (!Number.isInteger(after.rank) || !Number.isInteger(after.holders) || !after.asset) {
      after = null;
    }
  }
  const found = await indexedAssets(after, DIRECTORY_PAGE);
  const firstRank = (after?.rank ?? 0) + 1;
  const rows: AssetSummary[] = [];
  for (const a of found) {
    const identity = fromAssetKey(a.asset);
    if (identity) rows.push({ identity, holders: a.holders, supply: a.supply });
  }
  const last = found[found.length - 1];
  return {
    rows,
    firstRank,
    nextCursor:
      found.length === DIRECTORY_PAGE
        ? `${firstRank + found.length - 1}.${last.holders}.${last.asset}`
        : null,
  };
}

// "123.45" -> 1234500000n. Horizon amounts always carry up to 7 decimals
function toStroops(amount: string | undefined): bigint {
  if (!amount) return 0n;
  const [int = "0", frac = ""] = amount.split(".");
  return BigInt(int + frac.padEnd(7, "0").slice(0, 7));
}

async function horizonAsset(identity: AssetIdentity): Promise<AssetSummary> {
  // Horizon has no record for lumens, and Soroban-only tokens aren't assets to it
  if (identity.kind !== "issued") throw new NotFoundError("Asset");
  const page = await (await horizon())
    .assets()
    .forCode(identity.code)
    .forIssuer(identity.issuer)
    .limit(1)
    .call();
  const record = page.records[0] as
    | (AssetRecord & {
        accounts?: Record<string, number>;
        balances?: Record<string, string>;
        claimable_balances_amount?: string;
        liquidity_pools_amount?: string;
        contracts_amount?: string;
      })
    | undefined;
  if (!record) throw new NotFoundError("Asset");
  const holders = Object.values(record.accounts ?? {}).reduce((a, b) => a + Number(b), 0);
  const supply =
    Object.values(record.balances ?? {}).reduce((sum, b) => sum + toStroops(b), 0n) +
    toStroops(record.claimable_balances_amount) +
    toStroops(record.liquidity_pools_amount) +
    toStroops(record.contracts_amount);
  return { identity, holders, supply: supply.toString() };
}

/** Holders and supply of one asset: indexer on mainnet, Horizon otherwise. Throws NotFoundError. */
export const getAsset = cache(async (identity: AssetIdentity): Promise<AssetSummary> =>
  withIndexer(
    `asset ${identity.kind === "issued" ? identity.code : identity.kind}`,
    async () => {
      const found = await indexedAsset(assetKey(identity));
      return found ? { identity, holders: found.holders, supply: found.supply } : null;
    },
    () => horizonAsset(identity),
  ),
);

/** Address of the contract that represents a classic asset on Soroban. It exists once someone deploys it. */
export function assetContractId(identity: AssetIdentity, passphrase: string): string | null {
  try {
    if (identity.kind === "native") return Asset.native().contractId(passphrase);
    if (identity.kind === "issued") {
      return new Asset(identity.code, identity.issuer).contractId(passphrase);
    }
    return identity.contractId;
  } catch {
    return null;
  }
}

export type { IndexedHolder as AssetHolder };

/** Largest holders, indexer only. Null where there is no indexer or it failed. */
export const getTopHolders = cache(
  async (identity: AssetIdentity, limit = 100): Promise<IndexedHolder[] | null> => {
    if (!(await indexerActive())) return null;
    try {
      return await indexedTopHolders(assetKey(identity), limit);
    } catch (error) {
      console.warn(
        "[indexer] top holders failed:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  },
);
