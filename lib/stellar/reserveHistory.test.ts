import { describe, expect, it } from "vitest";
import { carryForward, unbrokenDays, walkBack, type Reserves } from "./reserveHistory";

const days = ["2026-10-30", "2026-10-31", "2026-11-01"];

describe("walkBack", () => {
  it("ends each day with what the next one started with", () => {
    const flows = new Map<string, Reserves>([
      ["2026-11-01", [100n, -20n]],
      ["2026-10-31", [-50n, 10n]],
    ]);
    expect(walkBack([1000n, 500n], flows, days)).toEqual([
      [950n, 510n],
      [900n, 520n],
      [1000n, 500n],
    ]);
  });

  it("keeps the reserves through a day with nothing moving", () => {
    expect(walkBack([7n, 9n], new Map(), days)).toEqual([
      [7n, 9n],
      [7n, 9n],
      [7n, 9n],
    ]);
  });

  it("stops where a reserve would go negative", () => {
    const flows = new Map<string, Reserves>([["2026-11-01", [200n, 0n]]]);
    expect(walkBack([100n, 50n], flows, days)).toEqual([null, null, [100n, 50n]]);
  });
});

describe("carryForward", () => {
  it("fills quiet days from the last one with a value", () => {
    expect(carryForward(new Map([["2026-10-31", "a"]]), days)).toEqual([null, "a", "a"]);
  });

  it("starts from the value before the first day", () => {
    expect(carryForward(new Map([["2026-11-01", "b"]]), days, "a")).toEqual(["a", "a", "b"]);
  });
});

describe("unbrokenDays", () => {
  it("keeps the consecutive days that end today", () => {
    expect(unbrokenDays(["2026-10-20", "2026-10-30", ...days], "2026-11-01")).toEqual(days);
  });

  it("is empty when today isn't indexed yet", () => {
    expect(unbrokenDays(days, "2026-11-02")).toEqual([]);
  });
});
