import { describe, expect, it } from "vitest";
import { detailsFlow, indexedFlow } from "./details";
import { ledgerCursor, parseCursor, txCursor } from "./cursor";

const USDC = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const ALICE = "GAXKIZGOZ4QKIHDGCWSJO6FOYIS6U2P4GJNJ6L2MFZ7R7QQJXEONYYVT";
const BOB = "GB5LFT2N4B7BKZBVHZ4HRCB7DKEKRZI7VDDPFN4BSQ2HVCNEG74LQQ2K";
const POOL = "CC642QYWXXR2HUZDNJ6KYN5LV5JFPFPT4Q6YNKLZLYEFWZZZ5SJYLA5G";

// details payloads below are real rows from the indexer
describe("detailsFlow", () => {
  it("payment: destination and amount in the asset", () => {
    expect(
      detailsFlow("payment", { asset: USDC, amount: "18988700000", destination: BOB }),
    ).toEqual({
      to: { kind: "address", address: BOB },
      amount: { value: "1898.87", asset: { code: "USDC", issuer: ISSUER } },
    });
  });

  it("create account: starting balance is XLM", () => {
    expect(
      detailsFlow("create_account", { destination: BOB, starting_balance: "10100000" }),
    ).toEqual({
      to: { kind: "address", address: BOB },
      amount: { value: "1.01", asset: { code: "XLM" } },
    });
  });

  it("path payment strict send: what was sent", () => {
    const flow = detailsFlow("path_payment_strict_send", {
      path: [USDC],
      dest_min: "29869931",
      dest_asset: "yHELIX:GDFAOY7JTTJYT5ZL73NJZYLKEWXTD6NLSFDHJY5AJ6EDX2A5BSPKIKLX",
      send_asset: "native",
      destination: BOB,
      send_amount: "29750927",
    });
    expect(flow.amount).toEqual({ value: "2.9750927", asset: { code: "XLM" } });
    expect(flow.to).toEqual({ kind: "address", address: BOB });
  });

  it("sell offer: asset pair, amount of what is sold", () => {
    expect(
      detailsFlow("manage_sell_offer", {
        price: { d: 400000, n: 81353 },
        amount: "3000000000",
        buying: USDC,
        selling: "native",
        offer_id: "1860516921",
      }),
    ).toEqual({
      to: { kind: "pair", from: { code: "XLM" }, to: { code: "USDC", issuer: ISSUER } },
      amount: { value: "300", asset: { code: "XLM" } },
    });
  });

  it("offer with amount 0 is a delete, not a transfer of 0", () => {
    const flow = detailsFlow("manage_sell_offer", {
      amount: "0",
      buying: USDC,
      selling: "native",
    });
    expect(flow.amount).toBeNull();
    expect(flow.to?.kind).toBe("pair");
  });

  it("change trust: the asset, or pool shares", () => {
    expect(
      detailsFlow("change_trust", {
        line: "GOLD:GBYJ2QQLAT75P43F7BT73NONRLW5BVCZFR4ZIJEDQABBMHHA734VBDQB",
        limit: "9223372036854775807",
      }).to,
    ).toEqual({
      kind: "asset",
      asset: { code: "GOLD", issuer: "GBYJ2QQLAT75P43F7BT73NONRLW5BVCZFR4ZIJEDQABBMHHA734VBDQB" },
    });
    expect(
      detailsFlow("change_trust", {
        line: "7a24749b3cd6453276225891cc926921e0843f28925fa0c6b6eeb385a13b3a7b",
      }).to,
    ).toEqual({ kind: "label", text: "Pool shares" });
  });

  it("claimable balance: first claimant", () => {
    const flow = detailsFlow("create_claimable_balance", {
      asset: USDC,
      amount: "10000000000",
      claimants: [
        { v0: { predicate: { rel_before: "86400" }, destination: BOB } },
        { v0: { predicate: "claim_predicate_unconditional", destination: ALICE } },
      ],
    });
    expect(flow.to).toEqual({ kind: "address", address: BOB });
    expect(flow.amount?.value).toBe("1000");
  });

  it("contract call: contract and function", () => {
    expect(
      detailsFlow("invoke_host_function", {
        auth: [ALICE],
        host_function: {
          invoke_contract: {
            args: [{ address: ALICE }, { i32: 31560 }],
            function_name: "deposit_position",
            contract_address: POOL,
          },
        },
      }),
    ).toEqual({
      to: { kind: "address", address: POOL, call: "deposit_position" },
      amount: null,
    });
  });

  it("contract deploy and wasm upload get labels", () => {
    expect(
      detailsFlow("invoke_host_function", {
        host_function: { create_contract_v2: { executable: { wasm_hash: "1b5f" } } },
      }).to,
    ).toEqual({ kind: "label", text: "New contract" });
    expect(
      detailsFlow("invoke_host_function", { host_function: { upload_contract_wasm: "00" } }).to,
    ).toEqual({ kind: "label", text: "Contract code upload" });
  });

  it("unknown types and broken details don't throw", () => {
    expect(detailsFlow("extend_footprint_ttl", { extend_to: 2073600 })).toEqual({
      to: null,
      amount: null,
    });
    expect(detailsFlow("payment", null)).toEqual({ to: null, amount: null });
    expect(detailsFlow("payment", { asset: USDC, amount: "abc", destination: BOB }).amount).toBeNull();
  });
});

describe("indexedFlow", () => {
  it("picks the first operation that targets something", () => {
    const flow = indexedFlow(
      [
        { type: "set_options", source: null, details: { home_domain: null } },
        { type: "payment", source: BOB, details: { asset: "native", amount: "50000000", destination: ALICE } },
      ],
      ALICE,
    );
    expect(flow).toEqual({
      from: BOB,
      to: { kind: "address", address: ALICE },
      amount: { value: "5", asset: { code: "XLM" } },
      moreOps: 1,
    });
  });

  it("no operations: source only", () => {
    expect(indexedFlow([], ALICE)).toEqual({ from: ALICE, to: null, amount: null, moreOps: 0 });
  });
});

describe("cursor", () => {
  // both values checked against Horizon paging tokens on mainnet
  it("matches Horizon's TOID", () => {
    expect(txCursor(64818369, 333)).toBe("278392775036424192");
    expect(ledgerCursor(64818374)).toBe("278392796509896704");
  });

  it("round-trips", () => {
    expect(parseCursor("278392775036424192")).toEqual({ ledger: 64818369, txIndex: 333 });
    expect(parseCursor(ledgerCursor(64818374))).toEqual({ ledger: 64818374, txIndex: 0 });
  });

  it("rejects anything that isn't a token", () => {
    expect(parseCursor("abc")).toBeNull();
    expect(parseCursor("-5")).toBeNull();
    expect(parseCursor("")).toBeNull();
  });
});
