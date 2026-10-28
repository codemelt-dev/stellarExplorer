import { describe, expect, it } from "vitest";
import { MIN_DEPTH_XLM, USDC, buildPriceBook, orderBookPrice, type PricePool } from "./prices";

const AQUA = "AQUA:GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA";
const EURC = "EURC:GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2";
const FAKE_USDC = "USDC:GCRPQTREUFE5LIGKYSFO24QMCQ44OCGVD6XYS7AVTZRPQIBCSXB2XWPN";

const stroops = (units: number) => String(Math.round(units * 10_000_000));
const pool = (id: string, a: string, ra: number, b: string, rb: number): PricePool => ({
  pool_id: id,
  asset_a: a,
  asset_b: b,
  reserve_a: stroops(ra),
  reserve_b: stroops(rb),
});

// the real XLM / USDC pool on 28 Oct 2026: 13.79M XLM against 2.34M USDC
const XLM_USDC = pool("xlm-usdc", "native", 13_792_604.059686, USDC, 2_341_592.1924574);

describe("buildPriceBook", () => {
  it("prices XLM from the Circle USDC pool", () => {
    const book = buildPriceBook([XLM_USDC]);
    expect(book.xlmUsd).toBeCloseTo(0.16977, 5);
    expect(book.xlmPoolId).toBe("xlm-usdc");
    expect(book.assets.get("native")).toMatchObject({ xlm: 1, source: "usdc pool" });
    expect(book.assets.get(USDC)?.usd).toBeCloseTo(1, 9);
  });

  it("ignores look-alike USDC from another issuer", () => {
    const book = buildPriceBook([pool("fake", "native", 50_000_000, FAKE_USDC, 1)]);
    expect(book.xlmUsd).toBeNull();
  });

  it("quotes an asset from its deepest XLM pool", () => {
    const book = buildPriceBook([
      XLM_USDC,
      pool("thin", "native", 2_000, AQUA, 1_000),
      pool("deep", "native", 500_000, AQUA, 1_000_000),
    ]);
    const aqua = book.assets.get(AQUA)!;
    expect(aqua).toMatchObject({ xlm: 0.5, source: "xlm pool", poolId: "deep", depthXlm: 500_000 });
    expect(aqua.usd).toBeCloseTo(0.5 * book.xlmUsd!, 9);
  });

  it("skips pools too thin to quote from", () => {
    const book = buildPriceBook([XLM_USDC, pool("thin", "native", MIN_DEPTH_XLM - 1, AQUA, 10)]);
    expect(book.assets.has(AQUA)).toBe(false);
  });

  it("falls back to a USDC pool when there is no deep XLM one", () => {
    const book = buildPriceBook([XLM_USDC, pool("eurc-usdc", EURC, 100_000, USDC, 116_000)]);
    const eurc = book.assets.get(EURC)!;
    expect(eurc).toMatchObject({ source: "usdc pool", poolId: "eurc-usdc" });
    expect(eurc.usd).toBeCloseTo(1.16, 9);
    expect(eurc.xlm).toBeCloseTo(1.16 / book.xlmUsd!, 9);
    expect(eurc.depthXlm).toBeCloseTo(116_000 / book.xlmUsd!, 6);
  });

  it("has no USD prices without the USDC pool, but keeps XLM ones", () => {
    const book = buildPriceBook([pool("deep", "native", 500_000, AQUA, 1_000_000)]);
    expect(book.xlmUsd).toBeNull();
    expect(book.assets.get(AQUA)).toMatchObject({ xlm: 0.5, usd: null });
  });
});

describe("orderBookPrice", () => {
  it("converts an order book mid with the pool's XLM price", () => {
    const book = buildPriceBook([XLM_USDC]);
    const price = orderBookPrice(book, 2);
    expect(price).toMatchObject({ xlm: 2, source: "order book", poolId: null, depthXlm: null });
    expect(price.usd).toBeCloseTo(2 * book.xlmUsd!, 9);
  });
});
