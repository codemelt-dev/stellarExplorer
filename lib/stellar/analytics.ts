import "server-only";
import { unstable_cache } from "next/cache";
import { StrKey } from "@stellar/stellar-sdk";
import { fromAssetKey, type AssetIdentity } from "./assetId";
import { withIndexer } from "./indexer/client";
import { indexedContractsById, indexedTopContracts } from "./indexer/contracts";
import { indexedNetworkDays, indexedSorobanFees } from "./indexer/stats";

// network history from the indexer's daily numbers, mainnet facts on every network

// a quarter of history
const DAYS = 90;
export const TOP_CONTRACT_DAYS = 7;
const TOP_CONTRACTS = 10;

const xlm = (stroops: string | number) => Number(stroops) / 10_000_000;

export interface NetworkDay {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  transactions: number;
  failed: number;
  soroban: number;
  operations: number;
  operationsByType: Record<string, number>;
  activeAccounts: number;
  newAccounts: number;
  /** In XLM, every transaction's fee. */
  fees: number;
  /** In XLM, the Soroban transactions' share; null when it couldn't be read. */
  sorobanFees: number | null;
  contractCalls: number;
  newContracts: number;
  tokenTransfers: number;
}

// Soroban fees aren't in daily_stats, so they're summed from every transaction,
// FEE_CHUNK_DAYS at a time. Chunks start on fixed days, so one that has ended
// keeps its cache key and is read once
const FEE_CHUNK_DAYS = 10;
const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const endedFeeChunk = unstable_cache(indexedSorobanFees, ["soroban-fees"], { revalidate: false });

async function loadSorobanFees(): Promise<Map<string, number>> {
  const today = Math.floor(Date.now() / DAY_MS);
  const fees = new Map<string, number>();
  // one chunk at a time: the backend runs few queries at once
  for (let start = today - DAYS - ((today - DAYS) % FEE_CHUNK_DAYS); start < today; start += FEE_CHUNK_DAYS) {
    const end = start + FEE_CHUNK_DAYS;
    const from = isoDay(start * DAY_MS);
    try {
      const rows =
        end <= today
          ? await endedFeeChunk(from, isoDay(end * DAY_MS))
          : await indexedSorobanFees(from, isoDay(today * DAY_MS));
      for (const r of rows) fees.set(r.day, xlm(r.fees));
    } catch (error) {
      // those days chart without the split
      console.warn(`[indexer] soroban fees ${from}: failed`, error instanceof Error ? error.message : error);
    }
  }
  return fees;
}

// throws on indexer errors so unstable_cache keeps only good results
async function loadNetworkDays(): Promise<NetworkDay[]> {
  const [rows, feesOn] = await Promise.all([indexedNetworkDays(DAYS), loadSorobanFees()]);
  return rows.map((r) => ({
    day: r.day,
    transactions: Number(r.transactions),
    failed: Number(r.failed_transactions),
    soroban: Number(r.soroban_transactions),
    operations: Number(r.operations),
    operationsByType: Object.fromEntries(Object.entries(r.operations_by_type).map(([type, n]) => [type, Number(n)])),
    activeAccounts: Number(r.active_accounts),
    newAccounts: Number(r.new_accounts),
    fees: xlm(r.fees_charged),
    sorobanFees: feesOn.get(r.day) ?? null,
    contractCalls: Number(r.contract_calls),
    newContracts: Number(r.new_contracts),
    tokenTransfers: Number(r.token_transfers),
  }));
}

const cachedNetworkDays = unstable_cache(loadNetworkDays, ["network-days"], { revalidate: 3600 });

/** Complete UTC days of network numbers, oldest first. Null when the indexer is off or failed. */
export function getNetworkDays(): Promise<NetworkDay[] | null> {
  return withIndexer<NetworkDay[] | null>("network days", cachedNetworkDays, async () => null, { anyNetwork: true });
}

export interface TopContract {
  contractId: string;
  calls: number;
  callers: number;
  /** The asset, when it's a Stellar asset's contract. */
  asset: AssetIdentity | null;
}

async function loadTopContracts(): Promise<TopContract[]> {
  const top = (await indexedTopContracts(TOP_CONTRACT_DAYS, TOP_CONTRACTS)).filter((c) =>
    StrKey.isValidContract(c.contractId),
  );
  // what each one is comes from current state; a miss there just leaves it unnamed
  const known = await indexedContractsById(top.map((c) => c.contractId)).catch(() => []);
  const assets = new Map(known.map((c) => [c.contract_id, c.asset ? fromAssetKey(c.asset) : null]));
  return top.map((c) => ({ ...c, asset: assets.get(c.contractId) ?? null }));
}

const cachedTopContracts = unstable_cache(loadTopContracts, ["top-contracts"], { revalidate: 3600 });

/** The most called contracts over the last week. Null when the indexer is off or failed. */
export function getTopContracts(): Promise<TopContract[] | null> {
  return withIndexer<TopContract[] | null>("top contracts", cachedTopContracts, async () => null, { anyNetwork: true });
}

