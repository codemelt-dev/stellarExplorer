import "server-only";
import { unstable_cache } from "next/cache";
import { assetKey, type AssetIdentity } from "./assetId";
import { foldDayFills, type AssetHistory, type Counter } from "./assetSeries";
import { indexedAssetSnapshots } from "./indexer/assets";
import { indexerRead } from "./indexer/client";
import { indexedDayFills } from "./indexer/market";
import { USDC } from "./prices";

/** The first day of asset snapshots, and so of the history. */
const HISTORY_START = "2026-10-08";
/** Volume reaches back this many days at most, the longest named range. */
const VOLUME_DAYS = 90;
// a request reads days of fills it hasn't cached for this long, the rest come on a later visit
const VOLUME_BUDGET_MS = 8_000;
const DAY_MS = 86_400_000;
const COUNTERS: Record<string, Counter> = { native: "XLM", [USDC]: "USDC" };

// snapshots land once a day, at about 00:15 UTC
const cachedSnapshots = unstable_cache(indexedAssetSnapshots, ["asset-snapshots"], { revalidate: 3600 });
// one read of a day's fills serves every asset's page, and a past day's fills never change
const cachedDayVolume = unstable_cache(
  async (day: string) => foldDayFills(await indexedDayFills(day, Object.keys(COUNTERS)), COUNTERS),
  ["asset-day-volume"],
  { revalidate: 30 * 86_400 },
);

// complete UTC days, oldest first: since the first snapshot, VOLUME_DAYS at most
function volumeDays(nowMs: number): string[] {
  const today = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const days: string[] = [];
  for (let t = Math.max(Date.parse(HISTORY_START), today - VOLUME_DAYS * DAY_MS); t < today; t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

async function volumeHistory(asset: string): Promise<AssetHistory["volume"]> {
  const days = volumeDays(Date.now());
  const started = Date.now();
  const out: AssetHistory["volume"] = [];
  // newest first, one day at a time
  for (let i = days.length - 1; i >= 0 && Date.now() - started < VOLUME_BUDGET_MS; i--) {
    try {
      out.unshift({ day: days[i], counters: (await cachedDayVolume(days[i]))[asset] ?? {} });
    } catch (error) {
      // the days read so far still chart
      if (!out.length) throw error;
      console.warn(`[indexer] asset volume for ${days[i]}: failed`, error instanceof Error ? error.message : error);
      break;
    }
  }
  return out;
}

/**
 * An asset's holders and supply at the end of each UTC day, and its DEX
 * volume against XLM and USDC. A Soroban-only token has no DEX volume: the
 * order book and classic pools trade classic assets. Null on testnet or when
 * the indexer fails.
 */
export function getAssetHistory(identity: AssetIdentity): Promise<AssetHistory | null> {
  const asset = assetKey(identity);
  const dex = identity.kind !== "contract";
  return indexerRead(`history ${asset.split(":")[0]}`, async () => {
    const [snapshots, volume] = await Promise.all([cachedSnapshots(asset), dex ? volumeHistory(asset) : []]);
    return {
      counters: dex ? Object.values(COUNTERS).filter((c) => c !== COUNTERS[asset]) : [],
      snapshots,
      volume,
    };
  });
}
