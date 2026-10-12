import { describe, expect, it } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { describeTokenEvent, sorobanTokenMovements, type DecodedContractEvent, type DecodedValue } from "./xdrDecode";

const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
// the real mainnet contract ids of USDC and of native XLM
const USDC_SAC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const XLM_SAC = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const OTHER = "CDMJRRH5MAJLB7T5SQAWQOOL7UJ3BABGTURSVKIE6AEDSXESDDJIBVCT";
const ALICE = "GCIWHQ7DH2LA5BC7VWCJCYJNISJTU3RYTZJCD3P5EU7BRYS7CFDVVVWB";
const BOB = "GBXOBDHNIVA4WOVIGDKBZQ6USVWIDFHEMPUPOARM5D2EHNQAN2IZMIHY";

const sym = (text: string): DecodedValue => ({ kind: "scalar", text, hint: "string" });
const addr = (text: string): DecodedValue => ({ kind: "scalar", text, hint: "address" });
const num = (text: string): DecodedValue => ({ kind: "scalar", text, hint: "number" });
const event = (contractId: string, topics: DecodedValue[], data: DecodedValue): DecodedContractEvent => ({
  contractId,
  topics,
  data,
});

describe("describeTokenEvent", () => {
  it("names the asset when its own contract emits the event", () => {
    const d = describeTokenEvent(
      event(USDC_SAC, [sym("transfer"), addr(ALICE), addr(OTHER), sym(`USDC:${ISSUER}`)], num("205000000")),
      Networks.PUBLIC,
    );
    expect(d).toEqual({
      kind: "transfer",
      token: USDC_SAC,
      from: ALICE,
      to: OTHER,
      amount: "205000000",
      asset: { code: "USDC", issuer: ISSUER },
    });
  });

  it("native XLM", () => {
    const d = describeTokenEvent(
      event(XLM_SAC, [sym("transfer"), addr(ALICE), addr(BOB), sym("native")], num("10000000")),
      Networks.PUBLIC,
    );
    expect(d?.asset).toEqual({ code: "XLM" });
  });

  it("mint: recipient is the last address, asset after it", () => {
    const d = describeTokenEvent(
      event(USDC_SAC, [sym("mint"), addr(BOB), sym(`USDC:${ISSUER}`)], num("7398321")),
      Networks.PUBLIC,
    );
    expect(d).toMatchObject({ kind: "mint", to: BOB, asset: { code: "USDC", issuer: ISSUER } });
  });

  it("ignores an asset name emitted by some other contract", () => {
    const d = describeTokenEvent(
      event(OTHER, [sym("transfer"), addr(ALICE), addr(BOB), sym(`USDC:${ISSUER}`)], num("205000000")),
      Networks.PUBLIC,
    );
    expect(d?.kind).toBe("transfer");
    expect(d?.asset).toBeUndefined();
  });

  it("the same contract id means nothing on another network", () => {
    const d = describeTokenEvent(
      event(USDC_SAC, [sym("transfer"), addr(ALICE), addr(BOB), sym(`USDC:${ISSUER}`)], num("1")),
      Networks.TESTNET,
    );
    expect(d?.asset).toBeUndefined();
  });

  it("custom token: no asset, amount stays in base units", () => {
    const d = describeTokenEvent(
      event(OTHER, [sym("transfer"), addr(OTHER), addr(ALICE)], num("19965856552273268787")),
      Networks.PUBLIC,
    );
    expect(d).toMatchObject({ kind: "transfer", amount: "19965856552273268787" });
    expect(d?.asset).toBeUndefined();
  });

  it("muxed transfer carries the amount inside a map", () => {
    const d = describeTokenEvent(
      event(
        USDC_SAC,
        [sym("transfer"), addr(ALICE), addr(BOB), sym(`USDC:${ISSUER}`)],
        { kind: "map", entries: [{ key: "amount", value: num("500") }, { key: "to_muxed_id", value: num("42") }] },
      ),
      Networks.PUBLIC,
    );
    expect(d?.amount).toBe("500");
  });

  it("anything else is not a token event", () => {
    expect(
      describeTokenEvent(event(OTHER, [sym("swap")], { kind: "map", entries: [] }), Networks.PUBLIC),
    ).toBeNull();
    expect(
      describeTokenEvent(event(OTHER, [sym("transfer"), addr(ALICE)], num("1")), Networks.PUBLIC),
    ).toBeNull();
  });
});

describe("sorobanTokenMovements", () => {
  it("a transfer moves out of one account and into the other, asset kept", () => {
    const moves = sorobanTokenMovements(
      [event(USDC_SAC, [sym("transfer"), addr(ALICE), addr(BOB), sym(`USDC:${ISSUER}`)], num("70"))],
      Networks.PUBLIC,
    );
    expect(moves.map((m) => [m.account, m.direction, m.asset?.code])).toEqual([
      [ALICE, "out", "USDC"],
      [BOB, "in", "USDC"],
    ]);
  });
});
