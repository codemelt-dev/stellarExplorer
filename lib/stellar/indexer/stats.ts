import "server-only";
import { chQuery } from "./client";

// network-wide daily numbers. daily_stats refreshes every 5 minutes, the asset
// snapshots and the state copy once a day (about 00:15 UTC)

export interface DayCount {
  /** Unix seconds, start of the UTC day. */
  date: number;
  count: number;
}

const unixDay = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;

/**
 * New accounts per day over the last `days` complete days. Today is still
 * filling up and the first indexed day started mid-day, so both are left out.
 */
export async function indexedNewAccounts(days: number): Promise<DayCount[]> {
  const rows = await chQuery<{ day: string; new_accounts: string | number }>(
    `SELECT day, new_accounts FROM daily_stats FINAL
     WHERE day >= today() - {days:UInt32} AND day < today()
       AND day > (SELECT min(day) FROM daily_stats)
     ORDER BY day`,
    { days },
  );
  return rows.map((r) => ({ date: unixDay(r.day), count: Number(r.new_accounts) }));
}

/**
 * New assets per day: assets whose first snapshot falls on that day. A
 * snapshot dated D is the state at the end of D. The window's first snapshot
 * is the baseline, everything in it already existed.
 */
export async function indexedNewAssets(days: number): Promise<DayCount[]> {
  const rows = await chQuery<{ day: string; assets: string | number }>(
    `SELECT first AS day, count() AS assets FROM (
       SELECT asset, min(date) AS first FROM asset_snapshots
       WHERE date >= today() - {days:UInt32} - 1 GROUP BY asset)
     WHERE first > (SELECT min(date) FROM asset_snapshots WHERE date >= today() - {days:UInt32} - 1)
     GROUP BY day ORDER BY day`,
    { days },
  );
  return rows.map((r) => ({ date: unixDay(r.day), count: Number(r.assets) }));
}

export interface IndexedAccountTotals {
  /** Accounts in the latest daily state copy. */
  total: number;
  /** Accounts created on the copy's day. */
  newOnDay: number;
}

export async function indexedAccountTotals(): Promise<IndexedAccountTotals | null> {
  const [row] = await chQuery<{ total: string | number; created: string | number }>(
    `SELECT r.total AS total, s.new_accounts AS created
     FROM (SELECT rows['state_accounts'] AS total, snapshot FROM state_copy_runs
           ORDER BY started_at DESC LIMIT 1) AS r
     LEFT JOIN (SELECT day, new_accounts FROM daily_stats FINAL) AS s ON s.day = r.snapshot`,
  );
  if (!row || !Number(row.total)) return null;
  return { total: Number(row.total), newOnDay: Number(row.created) };
}
