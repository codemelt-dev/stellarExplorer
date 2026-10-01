import { describe, expect, it } from "vitest";
import { roundAmount } from "./amount";

describe("roundAmount", () => {
  it("rounds half-up to the given decimals", () => {
    expect(roundAmount("37.3331825", 4)).toBe("37.3332");
    expect(roundAmount("31.2797892", 4)).toBe("31.2798");
    expect(roundAmount("1.23444", 4)).toBe("1.2344");
  });

  it("carries into the integer part", () => {
    expect(roundAmount("9.99996", 4)).toBe("10.0000");
    expect(roundAmount("0.99999", 2)).toBe("1.00");
  });

  it("leaves short amounts untouched", () => {
    expect(roundAmount("21.85", 4)).toBe("21.85");
    expect(roundAmount("1000", 4)).toBe("1000");
  });

  it("returns 0 when everything rounds away", () => {
    expect(roundAmount("0.0000001", 4)).toBe("0");
    expect(roundAmount("-0.00001", 4)).toBe("0");
  });

  it("keeps the sign", () => {
    expect(roundAmount("-5.123456", 3)).toBe("-5.123");
  });
});
