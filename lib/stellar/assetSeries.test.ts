import { describe, expect, it } from "vitest";
import type { ChAssetSnapshot } from "./indexer/assets";
import type { ChDayFills } from "./indexer/market";
import { foldDayFills, historySeries, type AssetHistory } from "./assetSeries";

const USDC = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const AQUA = "AQUA:GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA";
const snap = (day: string, holders: number, supply: string, computed_at = `${day} 23:59:59`): ChAssetSnapshot => ({
  day,
  holders: String(holders),
  supply,
  computed_at,
});
const history = (p: Partial<AssetHistory>): AssetHistory => ({ counters: [], snapshots: [], volume: [], ...p });

describe("historySeries", () => {
  it("keeps the later copy of a day copied twice", () => {
    const s = historySeries(
      history({
        snapshots: [
          snap("2026-10-08", 100, "10000000", "2026-10-09 00:15:00"),
          snap("2026-10-08", 105, "20000000", "2026-10-09 06:00:00"),
          snap("2026-10-08", 90, "30000000", "2026-10-09 03:00:00"),
          snap("2026-10-09", 110, "40000000"),
        ],
      }),
      7,
    );
    expect(s.days).toEqual(["2026-10-08", "2026-10-09"]);
    expect(s.holders).toEqual([105, 110]);
    expect(s.supply).toEqual([2, 4]);
  });

  it("scales the supply by the asset's decimals", () => {
    const rows = [snap("2026-10-08", 1, "160226848589608")];
    expect(historySeries(history({ snapshots: rows }), 7).supply[0]).toBeCloseTo(16_022_684.8589608, 6);
    expect(historySeries(history({ snapshots: rows }), 9).supply[0]).toBeCloseTo(160_226.848589608, 8);
  });

  it("shows the last snapshot for a missing day, never a zero", () => {
    const s = historySeries(
      history({
        counters: ["XLM"],
        snapshots: [snap("2026-10-08", 100, "10000000"), snap("2026-10-11", 130, "40000000")],
        volume: [
          { day: "2026-10-08", counters: { XLM: { trades: 3, volume: 50_000_000 } } },
          { day: "2026-10-10", counters: {} },
        ],
      }),
      7,
    );
    expect(s.days).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(s.holders).toEqual([100, 100, 100, 130]);
    expect(s.supply).toEqual([1, 1, 1, 4]);
    expect(s.carried).toEqual([null, "2026-10-08", "2026-10-08", null]);
    // a day read without trades is a zero, a day not read is a gap
    expect(s.volume.XLM).toEqual([5, null, 0, null]);
  });

  it("leaves a gap after the last snapshot", () => {
    const s = historySeries(
      history({
        counters: ["XLM"],
        snapshots: [snap("2026-10-08", 100, "10000000"), snap("2026-10-09", 110, "20000000")],
        volume: [{ day: "2026-10-11", counters: {} }],
      }),
      7,
    );
    expect(s.holders).toEqual([100, 110, null, null]);
    expect(s.carried).toEqual([null, null, null, null]);
  });

  it("charts nothing without data", () => {
    expect(historySeries(history({ counters: ["XLM"] }), 7)).toEqual({
      days: [],
      holders: [],
      supply: [],
      carried: [],
      volume: { XLM: [] },
    });
  });
});

describe("foldDayFills", () => {
  const fill = (sold_asset: string, bought_asset: string, trades: number, sold: number, bought: number): ChDayFills => ({
    sold_asset,
    bought_asset,
    trades: String(trades),
    sold: String(sold),
    bought: String(bought),
  });
  const counters = { native: "XLM", [USDC]: "USDC" } as const;

  it("counts the counter side of fills in both directions", () => {
    const out = foldDayFills([fill(AQUA, "native", 2, 1000, 30), fill("native", AQUA, 1, 20, 700), fill(AQUA, USDC, 4, 500, 5)], counters);
    expect(out[AQUA]).toEqual({ XLM: { trades: 3, volume: 50 }, USDC: { trades: 4, volume: 5 } });
  });

  it("counts a fill between two counters for both of them", () => {
    const out = foldDayFills([fill(USDC, "native", 5, 100, 800)], counters);
    expect(out[USDC]).toEqual({ XLM: { trades: 5, volume: 800 } });
    expect(out.native).toEqual({ USDC: { trades: 5, volume: 100 } });
  });
});
