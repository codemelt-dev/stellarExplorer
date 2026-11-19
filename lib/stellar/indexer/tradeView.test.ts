import { describe, expect, it } from "vitest";
import { toDexTrade, type ChTrade } from "./tradeView";

const USDC = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const row: ChTrade = {
  ledger_sequence: 65525974,
  tx_index: 298,
  op_index: 0,
  position: 5,
  closed_ts: 1794915912,
  venue: "orderbook",
  seller: "GDRL6XEQ6BM2QJPQPRT5M7K5AM7WUQPEAHEVNXP37X6VUFNOAVDLUZTL",
  buyer: "GBTB3MJPQKPIWLYX34IKBE7ENT46ZDVQGPAVHGBDOMNA4HP6Q2KKJFLH",
  sold_asset: "native",
  sold_amount: "40000000",
  bought_asset: USDC,
  bought_amount: "10000000",
};

describe("toDexTrade", () => {
  it("shows the buyer as the trader and prices the sold asset in the bought one", () => {
    expect(toDexTrade(row)).toEqual({
      id: "65525974-298-0-5",
      closedAt: "2026-11-17T11:45:12.000Z",
      account: row.buyer,
      poolId: null,
      baseAmount: "4.0000000",
      baseCode: "XLM",
      baseIssuer: undefined,
      counterAmount: "1.0000000",
      counterCode: "USDC",
      counterIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      price: 0.25,
      venue: "orderbook",
    });
  });

  it("gives a pool swap the pool's hex id", () => {
    const swap = toDexTrade({ ...row, venue: "pool", seller: "LCDLYHMOLHVPD5RYHM4Q4AO6PC52BMULXUU7CRJG5CRQCU7IM4GIGO2R" });
    expect(swap.venue).toBe("pool");
    expect(swap.poolId).toMatch(/^[0-9a-f]{64}$/);
  });
});
