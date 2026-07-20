import "server-only";

// mainnet daily network stats from stellar.expert, one big array since 2015.
// Cached an hour, we only ship the last 90 days to the client

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
}

export async function getNetworkGrowth(): Promise<NetworkGrowthData | null> {
  try {
    const res = await fetch(
      "https://api.stellar.expert/explorer/public/ledger/ledger-stats",
      {
        headers: { "User-Agent": "stellar-pulse-explorer" },
        next: { revalidate: 3600 },
      },
    );
    if (!res.ok) return null;
    const days = (await res.json()) as LedgerStatDay[];
    if (days.length < 2) return null;

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
    return { newAccounts, newAssets };
  } catch {
    return null;
  }
}
