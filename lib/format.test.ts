import { describe, expect, it } from "vitest";
import { percentGap } from "./format";

describe("percentGap", () => {
  it("signs the gap from the second figure", () => {
    expect(percentGap(38.5, 38.1)).toBe("+1.0%");
    expect(percentGap(88, 100)).toBe("-12.0%");
  });

  it("reads an exact match as no gap", () => {
    expect(percentGap(5, 5)).toBe("+0.0%");
  });
});
