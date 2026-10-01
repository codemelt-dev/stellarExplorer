import { Address, Asset, Operation, xdr, type OperationRecord as DecodedOp } from "@stellar/stellar-sdk";

// "from -> to" summary of a transaction, decoded from its envelope so list
// pages can say where value went without an extra request per row

export interface AssetRef {
  code: string;
  issuer?: string;
}

/** Who or what the main operation targets. */
export type TxTarget =
  | { kind: "address"; address: string; call?: string }
  | { kind: "pair"; from: AssetRef; to: AssetRef }
  | { kind: "asset"; asset: AssetRef }
  | { kind: "label"; text: string };

export interface TxFlow {
  from: string;
  to: TxTarget | null;
  amount: { value: string; asset: AssetRef } | null;
  /** Other operations in the same transaction. */
  moreOps: number;
}

const XLM: AssetRef = { code: "XLM" };

function assetRef(a: Asset): AssetRef {
  return a.isNative() ? XLM : { code: a.getCode(), issuer: a.getIssuer() };
}

function address(a: string, call?: string): TxTarget {
  return call ? { kind: "address", address: a, call } : { kind: "address", address: a };
}

// a zero offer amount means "delete this offer", not a transfer of 0
function nonZero(value: string, asset: Asset): TxFlow["amount"] {
  return Number(value) === 0 ? null : { value, asset: assetRef(asset) };
}

function hostFunctionTarget(fn: xdr.HostFunction): TxTarget | null {
  switch (fn.switch().name) {
    case "hostFunctionTypeInvokeContract": {
      const args = fn.invokeContract();
      return address(
        Address.fromScAddress(args.contractAddress()).toString(),
        args.functionName().toString(),
      );
    }
    case "hostFunctionTypeCreateContract":
    case "hostFunctionTypeCreateContractV2":
      return { kind: "label", text: "New contract" };
    case "hostFunctionTypeUploadContractWasm":
      return { kind: "label", text: "Contract code upload" };
    default:
      return null;
  }
}

type OpFlow = Pick<TxFlow, "to" | "amount">;

export function operationFlow(op: DecodedOp): OpFlow {
  switch (op.type) {
    case "payment":
      return { to: address(op.destination), amount: { value: op.amount, asset: assetRef(op.asset) } };
    case "pathPaymentStrictSend":
      return { to: address(op.destination), amount: { value: op.sendAmount, asset: assetRef(op.sendAsset) } };
    case "pathPaymentStrictReceive":
      return { to: address(op.destination), amount: { value: op.destAmount, asset: assetRef(op.destAsset) } };
    case "createAccount":
      return { to: address(op.destination), amount: { value: op.startingBalance, asset: XLM } };
    case "accountMerge":
      return { to: address(op.destination), amount: null };
    case "manageSellOffer":
    case "createPassiveSellOffer":
      return {
        to: { kind: "pair", from: assetRef(op.selling), to: assetRef(op.buying) },
        amount: nonZero(op.amount, op.selling),
      };
    case "manageBuyOffer":
      return {
        to: { kind: "pair", from: assetRef(op.selling), to: assetRef(op.buying) },
        amount: nonZero(op.buyAmount, op.buying),
      };
    case "changeTrust":
      return {
        to: op.line instanceof Asset
          ? { kind: "asset", asset: assetRef(op.line) }
          : { kind: "label", text: "Pool shares" },
        amount: null,
      };
    case "createClaimableBalance":
      return {
        to: op.claimants[0] ? address(op.claimants[0].destination) : null,
        amount: { value: op.amount, asset: assetRef(op.asset) },
      };
    case "beginSponsoringFutureReserves":
      return { to: address(op.sponsoredId), amount: null };
    case "liquidityPoolDeposit":
    case "liquidityPoolWithdraw":
      return { to: { kind: "label", text: "Liquidity pool" }, amount: null };
    case "invokeHostFunction":
      return { to: hostFunctionTarget(op.func), amount: null };
    default:
      return { to: null, amount: null };
  }
}

/** Flow of the first operation that targets something, else the first one. */
export function transactionFlow(ops: xdr.Operation[], txSource: string): TxFlow {
  let fallback: TxFlow | null = null;
  for (const raw of ops) {
    let op: DecodedOp;
    try {
      op = Operation.fromXDRObject(raw);
    } catch {
      continue;
    }
    const flow: TxFlow = {
      from: op.source ?? txSource,
      ...operationFlow(op),
      moreOps: ops.length - 1,
    };
    if (flow.to) return flow;
    fallback ??= flow;
  }
  return fallback ?? { from: txSource, to: null, amount: null, moreOps: Math.max(ops.length - 1, 0) };
}
