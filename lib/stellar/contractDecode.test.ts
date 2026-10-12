import { describe, expect, it } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { contractAsset, fromScJson, type ContractSummary } from "./contractDecode";

const G = "GC2B2DF4UJUT454A5DFY5QBUMNQ6S2PRKZGPFDZBJ6DVRO5LVMXOQEJL";

// shapes below are real values from the indexer
describe("fromScJson", () => {
  it("scalars", () => {
    expect(fromScJson({ symbol: "pool_state" })).toEqual({ kind: "scalar", text: "pool_state", hint: "string" });
    expect(fromScJson({ i128: "93683233341406" })).toEqual({ kind: "scalar", text: "93683233341406", hint: "number" });
    expect(fromScJson({ i32: 34140 })).toEqual({ kind: "scalar", text: "34140", hint: "number" });
    expect(fromScJson({ u256: "436716367981777518284266202556" }).kind).toBe("scalar");
    expect(fromScJson({ bool: false })).toEqual({ kind: "scalar", text: "false" });
    expect(fromScJson({ address: G })).toEqual({ kind: "scalar", text: G, hint: "address" });
    expect(fromScJson({ bytes: "155a17b9" })).toEqual({ kind: "scalar", text: "0x155a17b9" });
    expect(fromScJson(null)).toEqual({ kind: "scalar", text: "void" });
  });

  it("an asset name is a string, not an address", () => {
    expect(fromScJson({ string: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" })).toMatchObject({
      hint: "string",
    });
  });

  it("vec of mixed values", () => {
    expect(fromScJson({ vec: [{ i32: 31560 }, { i32: 35700 }, { i128: "1518542272" }] })).toEqual({
      kind: "list",
      items: [
        { kind: "scalar", text: "31560", hint: "number" },
        { kind: "scalar", text: "35700", hint: "number" },
        { kind: "scalar", text: "1518542272", hint: "number" },
      ],
    });
  });

  it("map: symbol keys read as their name", () => {
    expect(
      fromScJson({
        map: [
          { key: { symbol: "last_block" }, val: { u64: "1888" } },
          { key: { symbol: "to_claim" }, val: { u128: "18317690618" } },
        ],
      }),
    ).toEqual({
      kind: "map",
      entries: [
        { key: "last_block", value: { kind: "scalar", text: "1888", hint: "number" } },
        { key: "to_claim", value: { kind: "scalar", text: "18317690618", hint: "number" } },
      ],
    });
  });

  it("map: a compound key keeps its JSON", () => {
    const decoded = fromScJson({ map: [{ key: { vec: [{ symbol: "Admin" }] }, val: { address: G } }] });
    expect(decoded).toMatchObject({ kind: "map", entries: [{ key: '{"vec":[{"symbol":"Admin"}]}' }] });
  });

  it("unknown shapes stay raw instead of throwing", () => {
    expect(fromScJson({ ledger_key_contract_instance: null }).kind).toBe("raw");
    expect(fromScJson({ a: 1, b: 2 }).kind).toBe("raw");
    expect(fromScJson({ vec: "nope" }).kind).toBe("raw");
    expect(fromScJson([1, 2]).kind).toBe("raw");
  });
});

describe("contractAsset", () => {
  const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
  // the real mainnet contract id of USDC
  const USDC_SAC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
  const summary = (contractId: string, name: string, kind: "stellarAsset" | "wasm" = "stellarAsset"): ContractSummary => ({
    contractId,
    executable: kind === "wasm" ? { kind, wasmHash: "00" } : { kind },
    instanceStorage: [
      {
        key: "METADATA",
        value: {
          kind: "map",
          entries: [
            { key: "decimal", value: { kind: "scalar", text: "7", hint: "number" } },
            { key: "name", value: { kind: "scalar", text: name, hint: "string" } },
          ],
        },
      },
    ],
    lastModifiedLedger: null,
    liveUntilLedger: null,
  });

  it("reads the asset an asset contract stands for", () => {
    expect(contractAsset(summary(USDC_SAC, `USDC:${ISSUER}`), Networks.PUBLIC)).toEqual({
      code: "USDC",
      issuer: ISSUER,
    });
  });

  it("a name that doesn't match the address is ignored", () => {
    expect(contractAsset(summary(USDC_SAC, `USDT:${ISSUER}`), Networks.PUBLIC)).toBeUndefined();
  });

  it("a custom contract can't name itself an asset", () => {
    expect(contractAsset(summary(USDC_SAC, `USDC:${ISSUER}`, "wasm"), Networks.PUBLIC)).toBeUndefined();
  });
});
