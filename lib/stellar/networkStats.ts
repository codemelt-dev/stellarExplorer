import "server-only";
import { unstable_cache } from "next/cache";
import { withIndexer } from "./indexer/client";
import {
  indexedAccountTotals,
  indexedNewAccounts,
  indexedNewAssets,
  type DayCount,
} from "./indexer/stats";

// mainnet daily network stats, shown whatever network is selected. The indexer
// first; stellar.expert (one big array since 2015) when it is off or fails.
// We only ship the last 90 days to the client

interface LedgerStatDay {
  ts: number;
  accounts: number;
  new_assets: number;
  active_accounts: number;
  transactions: number;
}

export interface DailyPoint {
  date: number;
  volume: number;
}

export interface NetworkGrowthData {
  newAccounts: DailyPoint[];
  newAssets: DailyPoint[];
  source: "indexer" | "stellar.expert";
}

export interface AccountTotals {
  total: number;
  newLastDay: number;
}

// same URL + options everywhere so Next dedupes it into one cached fetch
async function fetchLedgerStats(): Promise<LedgerStatDay[] | null> {
  try {
    const res = await fetch(
      "https://api.stellar.expert/explorer/public/ledger/ledger-stats",
      {
        headers: { "User-Agent": "astrolabe-explorer" },
        next: { revalidate: 3600 },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as LedgerStatDay[];
  } catch {
    return null;
  }
}

const DAYS = 90;

const toPoints = (days: DayCount[]): DailyPoint[] =>
  days.map((d) => ({ date: d.date, volume: d.count }));

// throws on indexer errors so unstable_cache keeps only good results
const indexedGrowth = unstable_cache(
  async (): Promise<NetworkGrowthData | null> => {
    const [accounts, assets] = await Promise.all([
      indexedNewAccounts(DAYS),
      indexedNewAssets(DAYS),
    ]);
    if (!accounts.length || !assets.length) return null;
    return { newAccounts: toPoints(accounts), newAssets: toPoints(assets), source: "indexer" };
  },
  ["network-growth"],
  { revalidate: 900 },
);

const indexedTotals = unstable_cache(
  async (): Promise<AccountTotals | null> => {
    const totals = await indexedAccountTotals();
    return totals && { total: totals.total, newLastDay: totals.newOnDay };
  },
  ["account-totals"],
  { revalidate: 900 },
);

export async function getAccountTotals(): Promise<AccountTotals | null> {
  return withIndexer("account totals", indexedTotals, expertAccountTotals, { anyNetwork: true });
}

export async function getNetworkGrowth(): Promise<NetworkGrowthData | null> {
  return withIndexer("network growth", indexedGrowth, expertNetworkGrowth, { anyNetwork: true });
}

async function expertAccountTotals(): Promise<AccountTotals | null> {
  const days = await fetchLedgerStats();
  if (!days || days.length < 2) return null;
  const last = days[days.length - 1];
  const prev = days[days.length - 2];
  return {
    total: last.accounts,
    newLastDay: Math.max(0, last.accounts - prev.accounts),
  };
}

async function expertNetworkGrowth(): Promise<NetworkGrowthData | null> {
  try {
    const days = await fetchLedgerStats();
    if (!days || days.length < 2) return null;

    const recent = days.slice(-91);
    const newAccounts: DailyPoint[] = [];
    const newAssets: DailyPoint[] = [];
    for (let i = 1; i < recent.length; i++) {
      // accounts field is cumulative, diff gives that day's new accounts
      newAccounts.push({
        date: recent[i].ts,
        volume: Math.max(0, recent[i].accounts - recent[i - 1].accounts),
      });
      newAssets.push({ date: recent[i].ts, volume: recent[i].new_assets });
    }
    return { newAccounts, newAssets, source: "stellar.expert" };
  } catch {
    return null;
  }
}
