import { describe, expect, it } from "vitest";
import { resolveQuery, routeFor } from "./resolveQuery";

// Length matters, not checksum: 56-char uppercase base32 starting with G.
const ACCOUNT = "G" + "AW7ROVWTXNPJ7B4XUQKZDCJANNVLTHYAAT2VJRAT2VJRATTVA".padEnd(55, "7");
const CONTRACT = "CC5UKSPM4GNWK5L66NKIU5VBJEEXT55ODIFTNKFNZAIJ4TAEKTDNH3SS";
const MUXED =
  "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK";
const TX_HASH =
  "3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889";

describe("resolveQuery", () => {
  it("detects account addresses (G, 56 chars)", () => {
    expect(resolveQuery(ACCOUNT)).toEqual({ type: "account", id: ACCOUNT });
  });

  it("detects contract addresses (C, 56 chars)", () => {
    expect(resolveQuery(CONTRACT)).toEqual({ type: "contract", id: CONTRACT });
  });

  it("detects muxed accounts (M, 69 chars)", () => {
    expect(resolveQuery(MUXED)).toEqual({ type: "muxedAccount", id: MUXED });
  });

  it("detects transaction hashes (64 hex)", () => {
    expect(resolveQuery(TX_HASH)).toEqual({ type: "transaction", hash: TX_HASH });
    expect(resolveQuery(TX_HASH.toUpperCase())).toEqual({
      type: "transaction",
      hash: TX_HASH,
    });
  });

  it("detects ledger sequences (integers)", () => {
    expect(resolveQuery("123456")).toEqual({ type: "ledger", sequence: 123456 });
    expect(resolveQuery("0").type).not.toBe("ledger");
  });

  it("detects federation addresses", () => {
    expect(resolveQuery("alice*example.com")).toEqual({
      type: "federation",
      address: "alice*example.com",
    });
    expect(resolveQuery("bob*sub.domain.co.uk").type).toBe("federation");
  });

  it("detects CODE-ISSUER assets", () => {
    const q = `USDC-${ACCOUNT}`;
    expect(resolveQuery(q)).toEqual({
      type: "asset",
      code: "USDC",
      issuer: ACCOUNT,
    });
  });

  it("treats bare short strings as asset code search", () => {
    expect(resolveQuery("usdc")).toEqual({ type: "asset", code: "USDC" });
    expect(resolveQuery("XLM")).toEqual({ type: "asset", code: "XLM" });
  });

  it("never misroutes malformed near-misses", () => {
    // 55-char G string -> not an account
    expect(resolveQuery(ACCOUNT.slice(0, 55)).type).not.toBe("account");
    // lowercase strkey -> not an account (base32 is uppercase)
    expect(resolveQuery(ACCOUNT.toLowerCase()).type).not.toBe("account");
    // 63 hex chars -> not a tx
    expect(resolveQuery(TX_HASH.slice(0, 63)).type).not.toBe("transaction");
    // G-prefixed 56 chars with invalid base32 chars (0,1) -> not an account
    const invalid = "G" + "0".repeat(55);
    expect(resolveQuery(invalid).type).not.toBe("account");
  });

  it("trims whitespace", () => {
    expect(resolveQuery(`  ${ACCOUNT}  `)).toEqual({
      type: "account",
      id: ACCOUNT,
    });
  });

  it("returns unknown for garbage", () => {
    expect(resolveQuery("hello world!").type).toBe("unknown");
    expect(resolveQuery("").type).toBe("unknown");
  });
});

describe("routeFor", () => {
  it("routes each type", () => {
    expect(routeFor({ type: "account", id: ACCOUNT })).toBe(
      `/account/${ACCOUNT}`,
    );
    expect(routeFor({ type: "contract", id: CONTRACT })).toBe(
      `/contract/${CONTRACT}`,
    );
    expect(routeFor({ type: "transaction", hash: TX_HASH })).toBe(
      `/tx/${TX_HASH}`,
    );
    expect(routeFor({ type: "ledger", sequence: 5 })).toBe("/ledger/5");
    expect(routeFor({ type: "unknown", query: "x" })).toBeNull();
  });
});
