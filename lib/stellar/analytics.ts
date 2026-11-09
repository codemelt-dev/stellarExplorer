import "server-only";
import { unstable_cache } from "next/cache";
import { StrKey } from "@stellar/stellar-sdk";
import { fromAssetKey, type AssetIdentity } from "./assetId";
import { withIndexer } from "./indexer/client";
import { indexedContractsById, indexedTopContracts } from "./indexer/contracts";
import { indexedNetworkDays, indexedSorobanFees } from "./indexer/stats";

// network history from the indexer's daily numbers, mainnet facts on every network

// a quarter of history, once the indexer has it
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

// throws on indexer errors so unstable_cache keeps only good results
async function loadNetworkDays(): Promise<NetworkDay[]> {
  const [rows, sorobanFees] = await Promise.all([indexedNetworkDays(DAYS), indexedSorobanFees(DAYS)]);
  const feesOn = new Map(sorobanFees.map((r) => [r.day, xlm(r.fees)]));
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

