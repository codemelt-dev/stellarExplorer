import { describe, expect, it } from "vitest";
import { Asset, Keypair, Operation, StrKey } from "@stellar/stellar-sdk";
import { transactionFlow } from "./txFlow";

const source = Keypair.random().publicKey();
const other = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();
const USDC = new Asset("USDC", issuer);
const contract = StrKey.encodeContract(Buffer.alloc(32, 1));

describe("transactionFlow", () => {
  it("payment goes from the tx source to the destination with its amount", () => {
    const op = Operation.payment({ destination: other, asset: USDC, amount: "12.5" });
    const flow = transactionFlow([op], source);
    expect(flow.from).toBe(source);
    expect(flow.to).toEqual({ kind: "address", address: other });
    expect(Number(flow.amount?.value)).toBe(12.5);
    expect(flow.amount?.asset).toEqual({ code: "USDC", issuer });
    expect(flow.moreOps).toBe(0);
  });

  it("an operation source overrides the tx source", () => {
    const op = Operation.createAccount({ destination: other, startingBalance: "5", source: issuer });
    const flow = transactionFlow([op], source);
    expect(flow.from).toBe(issuer);
    expect(flow.amount?.asset).toEqual({ code: "XLM" });
  });

  it("offers show the asset pair, and a zero amount (cancel) shows no amount", () => {
    const op = Operation.manageSellOffer({
      selling: USDC,
      buying: Asset.native(),
      amount: "0",
      price: "1",
      offerId: "42",
    });
    const flow = transactionFlow([op], source);
    expect(flow.to).toEqual({ kind: "pair", from: { code: "USDC", issuer }, to: { code: "XLM" } });
    expect(flow.amount).toBeNull();
  });

  it("contract calls target the contract and name the function", () => {
    const op = Operation.invokeContractFunction({ contract, function: "swap", args: [] });
    expect(transactionFlow([op], source).to).toEqual({ kind: "address", address: contract, call: "swap" });
  });

  it("skips ops without a target and counts the rest", () => {
    const ops = [
      Operation.setOptions({ homeDomain: "example.com" }),
      Operation.payment({ destination: other, asset: Asset.native(), amount: "1" }),
    ];
    const flow = transactionFlow(ops, source);
    expect(flow.to).toEqual({ kind: "address", address: other });
    expect(flow.moreOps).toBe(1);
  });

  it("falls back to no target when nothing has one", () => {
    const flow = transactionFlow([Operation.bumpSequence({ bumpTo: "100" })], source);
    expect(flow).toEqual({ from: source, to: null, amount: null, moreOps: 0 });
  });
});
