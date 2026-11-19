import { describe, expect, it } from "vitest";
import type { ChPairHour } from "./indexer/market";
import { dailyRollup, priceChange, toMarketHours } from "./marketSeries";

const HOUR = 3600;
// 2026-11-16 22:00 UTC
const T0 = 1_794_866_400;
const units = (n: number) => String(n * 10_000_000);
const row = (t: number, base: number, counter: number, p: Partial<ChPairHour> = {}): ChPairHour => ({
  hour: t,
  trades: "2",
  base_volume: units(base),
  counter_volume: units(counter),
  open: counter / base,
  high: counter / base,
  low: counter / base,
  close: counter / base,
  ...p,
});

describe("toMarketHours", () => {
  it("fills quiet hours with the last price up to the current hour", () => {
    const hours = toMarketHours([row(T0, 100, 20), row(T0 + 2 * HOUR, 100, 30)], T0 + 3 * HOUR + 59);
    expect(hours.map((h) => h.t - T0)).toEqual([0, HOUR, 2 * HOUR, 3 * HOUR]);
    expect(hours.map((h) => h.price)).toEqual([0.2, 0.2, 0.3, 0.3]);
    expect(hours[1]).toMatchObject({ trades: 0, counterVolume: 0, open: null, close: null });
  });

  it("weights the price by volume, so a dust fill can't swing it", () => {
    // 100 at 0.2, plus a dust fill whose close is a wild 50
    const [h] = toMarketHours([row(T0, 100.0001, 20.005, { close: 50, high: 50 })], T0);
    expect(h.price).toBeCloseTo(0.2, 3);
    expect(h.high).toBe(50);
  });

  it("is empty without fills", () => {
    expect(toMarketHours([], T0)).toEqual([]);
  });
});

describe("dailyRollup", () => {
  it("adds up each UTC day and weights its price", () => {
    const days = dailyRollup(
      toMarketHours([row(T0, 100, 20, { high: 0.25, low: 0.15 }), row(T0 + 2 * HOUR, 100, 40)], T0 + 2 * HOUR),
    );
    expect(days.map((d) => d.day)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(days[0]).toMatchObject({ trades: 2, baseVolume: 100, price: 0.2, high: 0.25, low: 0.15 });
    expect(days[1]).toMatchObject({ trades: 2, counterVolume: 40, price: 0.4 });
  });
});

describe("priceChange", () => {
  it("compares the last price with the first", () => {
    expect(priceChange(toMarketHours([row(T0, 100, 20), row(T0 + HOUR, 100, 25)], T0 + HOUR))).toBeCloseTo(0.25, 9);
    expect(priceChange(toMarketHours([row(T0, 100, 20)], T0))).toBeNull();
  });
});
