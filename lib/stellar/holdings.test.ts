import { describe, expect, it } from "vitest";
import { USDC, buildPriceBook, type PricePool } from "./prices";
import { arrangeHoldings, holdingTotals, matchesHolding, toHoldings, type Holding } from "./holdings";
import type { BalanceLine } from "./accounts";

const AIRDROP = "GDZQ5KYWCPWJCSM6GR4BLTNRDC2LBDJZGQWR6BCDYR34J7CPRFOKWXLM";
const OTHER = "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA";
const [, CIRCLE] = USDC.split(":");

const pool = (id: string, a: string, ra: number, b: string, rb: number): PricePool => ({
  pool_id: id,
  asset_a: a,
  asset_b: b,
  reserve_a: String(ra * 10_000_000),
  reserve_b: String(rb * 10_000_000),
});
// XLM at $0.20
const book = buildPriceBook([pool("xlm-usdc", "native", 10_000_000, USDC, 2_000_000)]);

const issued = (code: string, issuer: string, balance: string): BalanceLine => ({
  asset_type: "credit_alphanum4",
  asset_code: code,
  asset_issuer: issuer,
  balance,
});
const balances: BalanceLine[] = [
  { asset_type: "native", balance: "100.0000000" },
  issued("USDC", CIRCLE, "50.0000000"),
  issued("ZED", OTHER, "1.0000000"),
  issued("ALUMINIUM", AIRDROP, "83473314000.0000000"),
  issued("BTC", AIRDROP, "88338436000.0000000"),
  issued("ETH", AIRDROP, "88338436000.0000000"),
  issued("EMPTY", OTHER, "0.0000000"),
  { asset_type: "liquidity_pool_shares", liquidity_pool_id: "ab".repeat(32), balance: "3.0000000" },
];
const holdings = toHoldings(balances, book);
const codes = (list: Holding[]) => list.map((h) => h.code);

describe("toHoldings", () => {
  it("values what the price book prices and nothing else", () => {
    expect(holdings.find((h) => h.code === "XLM")?.usd).toBeCloseTo(20, 6);
    expect(holdings.find((h) => h.code === "USDC")?.usd).toBeCloseTo(50, 6);
    expect(holdings.find((h) => h.code === "BTC")?.usd).toBeNull();
    expect(holdings.find((h) => h.kind === "pool")?.usd).toBeNull();
  });

  it("has no values on testnet", () => {
    expect(toHoldings(balances, null).every((h) => h.usd === null)).toBe(true);
  });
});

describe("arrangeHoldings", () => {
  const rest = holdings.filter((h) => h.kind !== "native");

  it("folds an issuer's unpriced pile into one row, after the single rows and before empty ones", () => {
    const entries = arrangeHoldings(rest, "value");
    expect(entries.map((e) => (e.kind === "issuer" ? `issuer ${e.issuer}` : e.holding.code))).toEqual([
      "USDC",
      "Pool shares",
      "ZED",
      `issuer ${AIRDROP}`,
      "EMPTY",
    ]);
    const folded = entries.find((e) => e.kind === "issuer");
    expect(folded?.kind === "issuer" && codes(folded.holdings)).toEqual(["ALUMINIUM", "BTC", "ETH"]);
  });

  it("sorts by name when asked", () => {
    const entries = arrangeHoldings(rest, "name");
    expect(entries.flatMap((e) => (e.kind === "holding" ? [e.holding.code] : []))).toEqual([
      "EMPTY",
      "Pool shares",
      "USDC",
      "ZED",
    ]);
  });

  it("keeps fewer than three unpriced assets of an issuer as rows", () => {
    const two = rest.filter((h) => h.code !== "ETH");
    expect(arrangeHoldings(two, "value").every((e) => e.kind === "holding")).toBe(true);
  });
});

describe("matchesHolding", () => {
  it("finds an asset by code or issuer, any case", () => {
    expect(codes(holdings.filter((h) => matchesHolding(h, "btc")))).toEqual(["BTC"]);
    expect(holdings.filter((h) => matchesHolding(h, "gdzq5k")).length).toBe(3);
    expect(holdings.filter((h) => matchesHolding(h, "  ")).length).toBe(holdings.length);
  });
});

describe("holdingTotals", () => {
  it("adds the priced holdings and counts the unpriced ones that hold something", () => {
    const totals = holdingTotals(holdings);
    expect(totals.usd).toBeCloseTo(70, 6);
    expect(totals.unpriced).toBe(5);
  });

  it("has no total when nothing is priced", () => {
    expect(holdingTotals(toHoldings(balances, null)).usd).toBeNull();
  });
});
