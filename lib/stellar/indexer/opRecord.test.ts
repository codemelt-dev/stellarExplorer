import { describe, expect, it } from "vitest";
import { Account, MuxedAccount } from "@stellar/stellar-sdk";
import { horizonAmount, toOperationRecord, type IndexedOpRow, type OpTransfer } from "./opRecord";
import { humanizeOperation, humanizeOperationFor } from "../humanize";

const TRADER = "GBTB3MJPQKPIWLYX34IKBE7ENT46ZDVQGPAVHGBDOMNA4HP6Q2KKJFLH";
const MAKER = "GDVRPYUUJMHM5OIZRVCJVIDHB4PMN5PTZ5UW5DJZW4CTIWQS7G6Q76VJ";
const BOB = "GBBCWNU6STVFYBJDX5YOYUUYWRYP56X3NJULZZSWGJ4GNNGG3RMGAPGJ";
const EURC = "EURC:GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2";
const EURC_ISSUER = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2";
const CONTRACT = "CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA";

function row(type_name: string, details: unknown, source = TRADER): IndexedOpRow {
  return {
    id: "279585195395633153",
    type: 0,
    type_name,
    source_account: source,
    source_account_muxed: "",
    details,
    successful: true,
    closedAt: "2026-10-23T15:31:08.000Z",
    txHash: "ab".repeat(32),
  };
}

const transfer = (asset: string, from: string, to: string, amount: string, position: number): OpTransfer => ({
  asset,
  from,
  to,
  amount,
  position,
});

// details payloads below are real rows from the indexer
describe("toOperationRecord", () => {
  it("keeps the Horizon envelope: id, paging token, hash, time, success", () => {
    const record = toOperationRecord(row("bump_sequence", { bump_to: "158325572705989491" }));
    expect(record).toMatchObject({
      id: "279585195395633153",
      paging_token: "279585195395633153",
      transaction_hash: "ab".repeat(32),
      created_at: "2026-10-23T15:31:08.000Z",
      transaction_successful: true,
      type: "bump_sequence",
      bump_to: "158325572705989491",
    });
  });

  it("payment: amount in 7 decimals, asset split into code and issuer", () => {
    const record = toOperationRecord(
      row("payment", { destination: BOB, asset: EURC, amount: "200000000000" }),
    );
    expect(humanizeOperation(record)).toEqual([
      { kind: "address", address: TRADER },
      { kind: "text", text: " sent " },
      { kind: "amount", amount: "20000.0000000", assetCode: "EURC", assetIssuer: EURC_ISSUER },
      { kind: "text", text: " to " },
      { kind: "address", address: BOB },
    ]);
  });

  it("payment to a muxed address reads as its base account", () => {
    const muxed = new MuxedAccount(new Account(BOB, "0"), "7").accountId();
    const record = toOperationRecord(row("payment", { destination: muxed, asset: "native", amount: "1" }));
    expect(humanizeOperationFor(record, BOB)).toEqual([
      { kind: "text", text: "received " },
      { kind: "amount", amount: "0.0000001", assetCode: "XLM" },
      { kind: "text", text: " from " },
      { kind: "address", address: TRADER },
    ]);
  });

  it("strict send path payment takes what was delivered from the transfers", () => {
    // an arbitrage loop: EURC out, EURC back, the last transfer is the delivery
    const record = toOperationRecord(
      row("path_payment_strict_send", {
        send_asset: EURC,
        send_amount: "68329",
        destination: TRADER,
        dest_asset: EURC,
        dest_min: "68346",
        path: ["native"],
      }),
      [
        transfer(EURC, TRADER, MAKER, "68329", 0),
        transfer("native", MAKER, TRADER, "432036", 1),
        transfer(EURC, MAKER, TRADER, "68352", 2),
        transfer(EURC, TRADER, TRADER, "68352", 3),
      ],
    );
    expect(record).toMatchObject({ source_amount: "0.0068329", amount: "0.0068352" });
  });

  it("strict receive path payment adds up what the sender paid in", () => {
    const record = toOperationRecord(
      row("path_payment_strict_receive", {
        send_asset: "native",
        send_max: "460784",
        destination: BOB,
        dest_asset: EURC,
        dest_amount: "461707",
        path: [],
      }),
      [
        transfer("native", TRADER, MAKER, "300000", 0),
        transfer("native", TRADER, MAKER, "150000", 1),
        transfer(EURC, MAKER, TRADER, "461707", 2),
        transfer(EURC, TRADER, BOB, "461707", 3),
      ],
    );
    expect(record).toMatchObject({ source_amount: "0.0450000", amount: "0.0461707", to: BOB });
  });

  it("failed path payment moved nothing on the side only transfers know", () => {
    const failed = (type: string, details: unknown) => ({ ...row(type, details), successful: false });
    const send = toOperationRecord(
      failed("path_payment_strict_send", { send_asset: "native", send_amount: "138355", destination: TRADER, dest_asset: "native", dest_min: "138456" }),
    );
    expect(send).toMatchObject({ source_amount: "0.0138355", amount: "0.0000000" });
    const receive = toOperationRecord(
      failed("path_payment_strict_receive", { send_asset: "native", send_max: "460784", destination: BOB, dest_asset: EURC, dest_amount: "461707" }),
    );
    expect(receive).toMatchObject({ source_amount: "0.0000000", amount: "0.0461707" });
  });

  it("successful path payment without transfers falls back to its limit", () => {
    const record = toOperationRecord(
      row("path_payment_strict_receive", {
        send_asset: "native",
        send_max: "460784",
        destination: BOB,
        dest_asset: EURC,
        dest_amount: "461707",
      }),
    );
    expect(record).toMatchObject({ source_amount: "0.0460784", amount: "0.0461707" });
  });

  it("sell offer: price from n/d, cancel when the amount is zero", () => {
    const update = toOperationRecord(
      row("manage_sell_offer", {
        selling: "native",
        buying: EURC,
        amount: "1000000000",
        price: { n: 441657, d: 2500000 },
        offer_id: "1862812041",
      }),
    );
    expect(update).toMatchObject({ amount: "100.0000000", price: "0.1766628", selling_asset_type: "native" });

    const cancel = toOperationRecord(
      row("manage_sell_offer", { selling: "native", buying: EURC, amount: "0", price: { n: 1, d: 1 }, offer_id: "42" }),
    );
    expect(humanizeOperation(cancel)).toEqual([
      { kind: "address", address: TRADER },
      { kind: "text", text: " cancelled sell offer " },
      { kind: "code", text: "#42" },
    ]);
  });

  it("removing a pool trustline names the pool by its id", () => {
    const record = toOperationRecord(
      row("change_trust", {
        line: {
          liquidity_pool: {
            constant_product: {
              asset_a: "SSLX:GBHFGY3ZNEJWLNO4LBUKLYOCEK4V7ENEBJGPRHHX7JU47GWHBREH37UR",
              asset_b: "STARDUST:GCPLNANLXTV2G6NPIRDPOLM5NAO5XH2IPYQBZCTTAKPNV4IRTU5X5B4S",
              fee: 30,
            },
          },
        },
        limit: "0",
      }),
    );
    const segments = humanizeOperation(record);
    expect(segments[1]).toEqual({ kind: "text", text: " removed trustline to liquidity pool " });
    expect(segments[2]).toMatchObject({ kind: "code", text: expect.stringMatching(/^[0-9a-f]{8}…$/) });
  });

  it("contract call names the function and the contract", () => {
    const record = toOperationRecord(
      row("invoke_host_function", {
        host_function: {
          invoke_contract: {
            contract_address: CONTRACT,
            function_name: "plant",
            args: [{ address: TRADER }, { i128: "0" }],
          },
        },
        auth: [TRADER],
      }),
    );
    expect(humanizeOperation(record)).toEqual([
      { kind: "address", address: TRADER },
      { kind: "text", text: " invoked " },
      { kind: "code", text: "plant" },
      { kind: "text", text: " on " },
      { kind: "address", address: CONTRACT },
    ]);
  });

  it("uploads and deployments read as such", () => {
    const upload = toOperationRecord(row("invoke_host_function", { host_function: { wasm: { size: 22565 } } }));
    expect(humanizeOperation(upload)[1]).toEqual({ kind: "text", text: " uploaded contract code" });
    const deploy = toOperationRecord(
      row("invoke_host_function", { host_function: { create_contract_v2: {} } }),
    );
    expect(humanizeOperation(deploy)[1]).toEqual({ kind: "text", text: " created a contract" });
  });

  it("set options: only the fields that were set, flags by name", () => {
    const record = toOperationRecord(
      row("set_options", {
        inflation_dest: null,
        clear_flags: null,
        set_flags: 3,
        master_weight: null,
        low_threshold: null,
        med_threshold: null,
        high_threshold: null,
        home_domain: null,
        signer: { key: BOB, weight: 0 },
      }),
    );
    expect(record).toMatchObject({
      signer_key: BOB,
      signer_weight: 0,
      set_flags_s: ["auth_required", "auth_revocable"],
    });
    expect(record).not.toHaveProperty("low_threshold");
    expect(record).not.toHaveProperty("home_domain");
  });
});

describe("horizonAmount", () => {
  it("pads stroops to 7 decimals", () => {
    expect(horizonAmount("15000000")).toBe("1.5000000");
    expect(horizonAmount("-1")).toBe("-0.0000001");
    expect(horizonAmount("9223372036854775807")).toBe("922337203685.4775807");
    expect(horizonAmount(68352n)).toBe("0.0068352");
    expect(horizonAmount(null)).toBe("");
  });
});
