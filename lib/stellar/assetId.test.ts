import { describe, expect, it } from "vitest";
import { assetHref, assetKey, fromAssetKey, parseAssetId } from "./assetId";

const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const CONTRACT = "CBI7UCH5KGSVQRO5H4SUCZUTZABCITZLRHQQZTWL2TK4RZ72TAR6IHRV";

describe("asset identity", () => {
  it("reads the three kinds of indexer key", () => {
    expect(fromAssetKey("native")).toEqual({ kind: "native", code: "XLM" });
    expect(fromAssetKey(`USDC:${ISSUER}`)).toEqual({ kind: "issued", code: "USDC", issuer: ISSUER });
    expect(fromAssetKey(CONTRACT)).toEqual({ kind: "contract", contractId: CONTRACT });
  });

  it("rejects anything else", () => {
    expect(fromAssetKey("USDC")).toBeNull();
    expect(fromAssetKey("USDC:nope")).toBeNull();
    expect(fromAssetKey(`US-DC:${ISSUER}`)).toBeNull();
    expect(fromAssetKey(`A:${ISSUER}:x`)).toBeNull();
    expect(fromAssetKey("")).toBeNull();
  });

  it("key and identity round-trip", () => {
    for (const key of ["native", `USDC:${ISSUER}`, CONTRACT]) {
      expect(assetKey(fromAssetKey(key)!)).toBe(key);
    }
  });

  it("links issued assets to their page and Soroban tokens to their contract", () => {
    expect(assetHref({ kind: "native", code: "XLM" })).toBe("/asset/XLM");
    expect(assetHref({ kind: "issued", code: "USDC", issuer: ISSUER })).toBe(`/asset/USDC-${ISSUER}`);
    expect(assetHref({ kind: "contract", contractId: CONTRACT })).toBe(`/contract/${CONTRACT}`);
  });

  it("parses the /asset/[id] segment", () => {
    expect(parseAssetId("XLM")).toEqual({ kind: "native", code: "XLM" });
    expect(parseAssetId(`USDC-${ISSUER}`)).toEqual({ kind: "issued", code: "USDC", issuer: ISSUER });
    expect(parseAssetId("USDC")).toBeNull();
    expect(parseAssetId(`-${ISSUER}`)).toBeNull();
    expect(parseAssetId(CONTRACT)).toBeNull();
  });
});
