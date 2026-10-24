import { describe, expect, it } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { toTxDetail, type ChTxOp, type ChTxRow, type ChTxTransfer } from "./txView";

// rows below are real mainnet rows from the indexer, trimmed to what matters
const XLM_SAC = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const USDC_SAC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const USDC = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const SENDER = "GA35Y6OVJ7AGVLOO7Q72GQQ5MPG3JXPQWIS4YLTNO5PY3HJHXW4MYKA4";
const VAULT = "CCNTWMOPJZFXK5H5DXBP4FEAWTP2EW7CRI75XTCAB4IKIXX5MS4OWJ6Q";
const SPONSOR = "GBVVWAJ7BQOQW3R3NL4HXRRZ5VR2BVTMRIF57SK3UYN6RNW3S2S5GT34";
const FUNDER = "GAVNQYX4KL5W5URJ3TAVOK7CNZY2NCALRRAW2FAEJ3YIUEBFVMRHG5EK";
const NEWBIE = "GAUARSA42RVRSJFA5LXOV5CH73IAANJEQ3NJA2HQADEWNTGSOUZSPNJU";
const POOL = "LDQEHF6TN2HA6JYUWMYILJQAOOLJP6YXKI7TAWMVO7WZAZJW4MQ4HHHA";

function tx(overrides: Partial<ChTxRow> = {}): ChTxRow {
  return {
    ledger_sequence: 65090388,
    tx_index: 46,
    tx_hash: "6523b951f2f28e4fc744eb61f208058c5deafa32b22b8fb0bd75623cfd110cfd",
    inner_tx_hash: "0".repeat(64),
    closed_ts: 1792737723,
    source_account: FUNDER,
    account_sequence: "279087451635496013",
    fee_account: FUNDER,
    max_fee: "1000",
    fee_charged: "100",
    successful: true,
    result_code: 0,
    memo_type: "none",
    memo: "",
    ...overrides,
  };
}

function op(type_name: string, details: unknown, overrides: Partial<ChTxOp> = {}): ChTxOp {
  return {
    op_id: "279561087744139265",
    op_index: 0,
    type: 0,
    type_name,
    source_account: FUNDER,
    source_account_muxed: "",
    details: JSON.stringify(details),
    result_code: `${type_name}_success`,
    return_value: "",
    ...overrides,
  };
}

function transfer(t: Partial<ChTxTransfer>): ChTxTransfer {
  return {
    op_index: 0,
    position: 0,
    kind: "transfer",
    asset: "native",
    contract_id: XLM_SAC,
    from_address: "",
    to_address: "",
    amount: "0",
    ...t,
  };
}

const fee = (amount: string, position = 0, from = FUNDER) =>
  transfer({ op_index: -1, position, kind: "fee", from_address: from, amount });

describe("toTxDetail", () => {
  it("contract call through a fee bump: call, events, fee refund, no duplicate movements", () => {
    const detail = toTxDetail(
      "bf74c9980269c7731518f497ed7101e84cd0d70046c157a4215d8da87a1941cb",
      tx({
        tx_hash: "bf74c9980269c7731518f497ed7101e84cd0d70046c157a4215d8da87a1941cb",
        inner_tx_hash: "a0a68af192c6d6cd3d6782a9c3fb0ee791ea67d06d3c7cbf515817e650341ad7",
        source_account: SENDER,
        fee_account: SPONSOR,
        max_fee: "211355",
        fee_charged: "6661",
        result_code: 1,
      }),
      [
        op(
          "invoke_host_function",
          {
            host_function: {
              invoke_contract: {
                contract_address: USDC_SAC,
                function_name: "transfer",
                args: [{ address: SENDER }, { address: VAULT }, { i128: "2400000000" }],
              },
            },
          },
          { type: 24, source_account: SENDER, return_value: '{"void":null}' },
        ),
      ],
      [
        {
          op_index: 0,
          contract_id: USDC_SAC,
          topics: ['{"symbol":"transfer"}', `{"address":"${SENDER}"}`, `{"address":"${VAULT}"}`, `{"string":"${USDC}"}`],
          data: '{"i128":"2400000000"}',
        },
      ],
      [
        fee("11555", 0, SPONSOR),
        fee("-4894", 1, SPONSOR),
        transfer({ asset: USDC, contract_id: USDC_SAC, from_address: SENDER, to_address: VAULT, amount: "2400000000" }),
      ],
      Networks.PUBLIC,
    );

    expect(detail).toMatchObject({
      createdAt: "2026-10-23T06:42:03Z",
      feeAccount: SPONSOR,
      innerHash: "a0a68af192c6d6cd3d6782a9c3fb0ee791ea67d06d3c7cbf515817e650341ad7",
      error: null,
      feeEvents: { charged: "11555", refunded: "4894" },
      returnValues: [null],
      preconditions: null,
      resources: null,
      raw: null,
    });
    expect(detail.invocations[0]).toEqual({
      kind: "invokeContract",
      contractId: USDC_SAC,
      functionName: "transfer",
      args: [
        { kind: "scalar", text: SENDER, hint: "address" },
        { kind: "scalar", text: VAULT, hint: "address" },
        { kind: "scalar", text: "2400000000", hint: "number" },
      ],
    });
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0].topics[0]).toEqual({ kind: "scalar", text: "transfer", hint: "string" });
    // the call's transfer is counted once, from its event
    expect(detail.movements).toEqual([
      expect.objectContaining({ account: SENDER, direction: "out", amount: "2400000000", asset: { code: "USDC", issuer: USDC.split(":")[1] } }),
      expect.objectContaining({ account: VAULT, direction: "in", amount: "2400000000" }),
    ]);
  });

  it("create account: the new account reads as created, classic events stay off the events list", () => {
    const detail = toTxDetail(
      tx().tx_hash,
      tx(),
      [op("create_account", { destination: NEWBIE, starting_balance: "10100000" })],
      [
        {
          op_index: 0,
          contract_id: XLM_SAC,
          topics: ['{"symbol":"transfer"}', `{"address":"${FUNDER}"}`, `{"address":"${NEWBIE}"}`, '{"string":"native"}'],
          data: '{"i128":"10100000"}',
        },
      ],
      [fee("100"), transfer({ from_address: FUNDER, to_address: NEWBIE, amount: "10100000" })],
      Networks.PUBLIC,
    );
    expect(detail.events).toEqual([]);
    expect(detail.innerHash).toBeNull();
    expect(detail.movements).toEqual([
      { account: FUNDER, direction: "out", amount: "10100000", token: XLM_SAC, asset: { code: "XLM" }, kind: "transfer", label: undefined },
      { account: NEWBIE, direction: "in", amount: "10100000", token: XLM_SAC, asset: { code: "XLM" }, kind: "transfer", label: "account created" },
    ]);
    expect(detail.flow).toMatchObject({ from: FUNDER, to: { kind: "address", address: NEWBIE } });
  });

  it("path payment: legs against pools are trades, the last hop is the payment", () => {
    const detail = toTxDetail(
      tx().tx_hash,
      tx(),
      [
        op("path_payment_strict_send", {
          send_asset: "native",
          send_amount: "200259",
          destination: NEWBIE,
          dest_asset: USDC,
          dest_min: "1",
          path: [],
        }),
      ],
      [],
      [
        transfer({ position: 0, from_address: FUNDER, to_address: POOL, amount: "200259" }),
        transfer({ position: 1, asset: USDC, contract_id: USDC_SAC, from_address: POOL, to_address: FUNDER, amount: "35262" }),
        transfer({ position: 2, asset: USDC, contract_id: USDC_SAC, from_address: FUNDER, to_address: NEWBIE, amount: "35262" }),
      ],
      Networks.PUBLIC,
    );
    expect(detail.movements.map((m) => `${m.account.slice(0, 4)} ${m.direction} ${m.label ?? "-"}`)).toEqual([
      "GAVN out trade filled",
      "LDQE in trade filled",
      "LDQE out trade filled",
      "GAVN in trade filled",
      "GAVN out -",
      "GAUA in -",
    ]);
    expect(detail.ops[0]).toMatchObject({ amount: "0.0035262", source_amount: "0.0200259" });
  });

  it("trustline: no money moves, a note says what changed", () => {
    const detail = toTxDetail(
      tx().tx_hash,
      tx(),
      [op("change_trust", { line: "yBTC:GBUVRNH4RW4VLHP4C5MOF46RRIRZLAVHYGX45MVSTKA2F6TMR7E7L6NW", limit: "9223372036854775807" })],
      [],
      [fee("100")],
      Networks.PUBLIC,
    );
    expect(detail.movements).toEqual([]);
    expect(detail.notes).toEqual([{ account: FUNDER, label: "trustline set (yBTC)" }]);
  });

  it("failed payment: reason from the stored codes, nothing moved, every op failed", () => {
    const detail = toTxDetail(
      tx().tx_hash,
      tx({ successful: false, result_code: -1 }),
      [
        op(
          "payment",
          { destination: NEWBIE, asset: "KTOKEN:GAFK7QYUEOGDVM4CTI7ELVQIMNPVYUH4D5XERZMYLK45DLHOC5CLQGIH", amount: "100000000" },
          { type: 1, result_code: "payment_no_trust" },
        ),
        op("change_trust", { line: USDC, limit: "0" }, { op_index: 1, type: 6 }),
      ],
      [],
      [fee("100")],
      Networks.PUBLIC,
    );
    expect(detail.error).toEqual({ transactionCode: "transaction failed", operationCodes: ["payment no trust"] });
    expect(detail.ops.map((o) => o.transaction_successful)).toEqual([false, false]);
    expect(detail.movements).toEqual([]);
    expect(detail.notes).toEqual([]);
  });

  it("memo: hash memos are stored as hex, shown as is", () => {
    const hex = "8b4b4b2db2e575928d4c2d716ecf0c0e724761f8aef46f2812d8ca191d3a77d8";
    const detail = toTxDetail(tx().tx_hash, tx({ memo_type: "hash", memo: hex }), [], [], [], Networks.PUBLIC);
    expect(detail.memo).toEqual({ label: "Memo (hash)", text: hex });
    expect(toTxDetail(tx().tx_hash, tx(), [], [], [], Networks.PUBLIC).memo).toBeNull();
  });
});
