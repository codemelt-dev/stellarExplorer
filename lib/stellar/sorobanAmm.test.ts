import { describe, expect, it } from "vitest";
import { aquariusPool, feeBpOf, reservesOf, sortTokens, tickPrice, topicAddress } from "./sorobanAmm";

const XLM = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const OTHER = "CC546RSLM66Y34CYQDOLJ5HXOTN4C3PQ4QUH3FP3MJHOBLVUZWLE6JGG";
const USDX = "CDOFW7HNKLUZRLFZST4EW7V3AV4JI5IHMT6BPXXSY2IEFZ4NE5TWU2P4";

const reserves = (a: string, b: string) => ({
  trade: 0,
  token_in: "",
  data: `{"vec":[{"i128":"${a}"},{"i128":"${b}"}]}`,
});
const trade = (token: string, amountIn: string, amountOut: string, fee: string) => ({
  trade: 1,
  token_in: `{"address":"${token}"}`,
  data: `{"vec":[{"i128":"${amountIn}"},{"i128":"${amountOut}"},{"i128":"${fee}"}]}`,
});

describe("reservesOf", () => {
  it("reads Aquarius update_reserves and Soroswap sync", () => {
    expect(reservesOf('{"vec":[{"i128":"7706620813"},{"i128":"9277484104"}]}')).toEqual([
      "7706620813",
      "9277484104",
    ]);
    expect(
      reservesOf(
        '{"map":[{"key":{"symbol":"new_reserve_0"},"val":{"i128":"2749700386425"}},{"key":{"symbol":"new_reserve_1"},"val":{"i128":"2488952460649"}}]}',
      ),
    ).toEqual(["2749700386425", "2488952460649"]);
  });

  it("skips pools of three tokens and anything unreadable", () => {
    expect(reservesOf('{"vec":[{"i128":"1"},{"i128":"2"},{"i128":"3"}]}')).toBeNull();
    expect(reservesOf('{"vec":[{"i128":"-1"},{"i128":"2"}]}')).toBeNull();
    expect(reservesOf("")).toBeNull();
    expect(reservesOf("not json")).toBeNull();
  });
});

describe("tickPrice", () => {
  it("turns a concentrated pool's tick into token 1 per token 0", () => {
    // the XLM / SHX pool traded at about 36.9 SHX per XLM at this tick
    const state = '{"vec":[{"u256":"480633664511359599034621457535"},{"i32":36057},{"i128":"262389304736336"}]}';
    expect(tickPrice(state)).toBeCloseTo(36.8, 1);
    expect(tickPrice('{"vec":[{"u256":"1"},{"i32":0},{"i128":"1"}]}')).toBe(1);
    expect(tickPrice("")).toBeNull();
  });
});

describe("sortTokens", () => {
  it("orders by contract id bytes, not by strkey text", () => {
    // as text "CC5…" sorts first; as bytes USDC's id is smaller
    expect(sortTokens([OTHER, USDC])).toEqual([USDC, OTHER]);
    expect(sortTokens([USDC, XLM])).toEqual([XLM, USDC]);
  });
});

describe("feeBpOf and topicAddress", () => {
  it("rounds a trade's fee share to basis points", () => {
    expect(feeBpOf(1261675642 / 420558547106)).toBe(30);
    expect(feeBpOf(26 / 25069)).toBe(10);
    expect(feeBpOf(0)).toBeNull();
  });

  it("reads token contracts from topics", () => {
    expect(topicAddress(`{"address":"${XLM}"}`)).toBe(XLM);
    expect(topicAddress('{"address":"GARXWPHUQUXDIXFIXTYMCGDR3D632KTQUNM53HDMKT6T5GZV5IL6ZNTH"}')).toBeNull();
    expect(topicAddress('{"symbol":"trade"}')).toBeNull();
  });
});

describe("aquariusPool", () => {
  it("tells a constant product pool by the fee that left its reserves", () => {
    // the XLM / USDC pool at 0.10%: its event reports the protocol's 0.05%
    const pool = aquariusPool(
      [
        reserves("97816216992045", "16337743089521"),
        trade(USDC, "610403078", "3651045293", "305202"),
        reserves("97819868037338", "16337132991645"),
      ],
      [XLM, USDC],
    );
    expect(pool).toMatchObject({ kind: "constant_product", feeBp: 10 });
    expect(pool!.price).toBeCloseTo(0.1672, 4);
  });

  it("tells a stable pool by the half fee it keeps", () => {
    const pool = aquariusPool(
      [
        reserves("2656380063003", "4052951771051"),
        trade(USDX, "6644984", "6642306", "665"),
        reserves("2656386705309", "4052945126400"),
      ],
      [USDC, USDX],
    );
    expect(pool).toMatchObject({ kind: "stable", feeBp: 1 });
    expect(pool!.price).toBeCloseTo(1.0004, 4);
  });

  it("skips trades too small to tell and gives up without one", () => {
    const tiny = [reserves("100", "100"), trade(USDC, "5000", "4990", "5"), reserves("95", "105")];
    expect(aquariusPool(tiny, [XLM, USDC])).toBeNull();
    expect(aquariusPool([reserves("1", "2")], [XLM, USDC])).toBeNull();
  });
});
