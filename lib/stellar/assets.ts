import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { Asset, Horizon, Networks } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";
import { getXlmMarket } from "./market";
import { fetchTomlOrgInfo } from "./toml";
import { NotFoundError } from "./transactions";
import { assetKey, fromAssetKey, type AssetIdentity } from "./assetId";
import { indexerActive, indexerRead, withIndexer } from "./indexer/client";
import {
  indexedAsset,
  indexedAssets,
  indexedHolderLinks,
  indexedListedAssets,
  indexedTokenActivity,
  indexedTopHolders,
  indexedXlmPrice,
  type IndexedHolder,
  type IndexedHolderLink,
} from "./indexer/assets";

export type AssetRecord = Horizon.ServerApi.AssetRecord;

/** Assets matching a code, most-held first. */
export const searchAssetsByCode = cache(
  async (code: string, issuer?: string): Promise<AssetRecord[]> => {
    try {
      let query = (await horizon())
        .assets()
        .forCode(code)
        .order("desc")
        .limit(10);
      if (issuer) query = query.forIssuer(issuer);
      const page = await query.call();
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
  (identity: AssetIdentity, limit = 100): Promise<IndexedHolder[] | null> =>
    indexerRead("top holders", () => indexedTopHolders(assetKey(identity), limit)),
);

export type { IndexedHolderLink as HolderLink };

/** How far back transfers between top holders count as a link. */
export const HOLDER_LINK_DAYS = 90;

// a few seconds on the busiest assets, and the ranking only changes daily
const cachedHolderLinks = unstable_cache(
  (asset: string, holders: string[]) => indexedHolderLinks(asset, holders, HOLDER_LINK_DAYS),
  ["holder-links"],
  { revalidate: 3600 },
);

/** Which of the given holders moved the asset between each other. Indexer only, null when off or failed. */
export function getHolderLinks(identity: AssetIdentity, holders: string[]): Promise<IndexedHolderLink[] | null> {
  return indexerRead("holder links", () => cachedHolderLinks(assetKey(identity), holders));
}

export interface TopToken {
  identity: Extract<AssetIdentity, { kind: "issued" }>;
  org: string;
  image: string | null;
  /** From the order book against XLM, times the XLM price. */
  priceUsd: number | null;
  /** Distinct senders over the last 7 days. */
  senders: number;
  /** The same, per day, oldest first. */
  dailySenders: number[];
  holders: number;
}

const TOKEN_CANDIDATES = 40;
const TOP_TOKENS = 6;

// throws on indexer errors so unstable_cache keeps only good results
async function loadTopTokens(): Promise<TopToken[]> {
  const listed = (await indexedListedAssets(TOKEN_CANDIDATES)).map((a) => ({
    ...a,
    contractId: new Asset(a.code, a.issuer).contractId(Networks.PUBLIC),
  }));
  const activity = new Map(
    (await indexedTokenActivity(listed.map((a) => a.contractId))).map((a) => [a.contractId, a]),
  );
  // airdropped assets top the holder count, so rank by who actually moves them
  const ranked = listed
    .flatMap((a) => {
      const act = activity.get(a.contractId);
      return act ? [{ ...a, ...act }] : [];
    })
    .sort((a, b) => b.senders - a.senders)
    .slice(0, TOP_TOKENS);

  const [tomls, xlm, prices] = await Promise.all([
    Promise.all(ranked.map((a) => fetchTomlOrgInfo(a.homeDomain))),
    getXlmMarket(),
    Promise.all(ranked.map((a) => indexedXlmPrice(`${a.code}:${a.issuer}`).catch(() => null))),
  ]);
  return ranked.map((a, i) => {
    const price = prices[i];
    const toml = tomls[i];
    // big issuers don't always serve a toml (circle.com doesn't), the home domain stands in
    return {
      identity: { kind: "issued", code: a.code, issuer: a.issuer },
      org: toml?.orgName ?? a.homeDomain,
      image:
        toml?.currencies.find((c) => c.code === a.code && c.issuer === a.issuer)?.image ?? null,
      priceUsd: price !== null && xlm ? price * xlm.priceUsd : null,
      senders: a.senders,
      dailySenders: a.dailySenders,
      holders: a.holders,
    };
  });
}

const cachedTopTokens = unstable_cache(loadTopTokens, ["home-top-tokens"], { revalidate: 900 });

/** Home card, mainnet whatever network is selected. Indexer only, null when it is off or failed. */
export async function getTopTokens(): Promise<TopToken[] | null> {
  return withIndexer("top tokens", cachedTopTokens, async () => null, { anyNetwork: true });
}
