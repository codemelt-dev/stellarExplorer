import { stroopsToLumens } from "../amount";
import type { AssetRef, TxFlow, TxTarget } from "../txFlow";

// The indexer stores each operation body as JSON ("details"): XDR field names
// in snake_case, assets as "native" or "CODE:ISSUER", amounts in stroops.
// Same summary as txFlow.ts builds from an envelope, from that JSON instead

type Details = Record<string, unknown>;

export interface IndexedOp {
  type: string;
  source: string | null;
  details: unknown;
}

const XLM: AssetRef = { code: "XLM" };

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asset(value: unknown): AssetRef | null {
  const s = str(value);
  if (!s) return null;
  if (s === "native") return XLM;
  const [code, issuer] = s.split(":");
  return issuer ? { code, issuer } : { code };
}

function to(value: unknown, call?: string): TxTarget | null {
  const a = str(value);
  if (!a) return null;
  return call ? { kind: "address", address: a, call } : { kind: "address", address: a };
}

function amount(stroops: unknown, of: unknown): TxFlow["amount"] {
  const s = str(stroops);
  const ref = asset(of);
  if (!s || !ref || !/^-?\d+$/.test(s)) return null;
  return { value: stroopsToLumens(s), asset: ref };
}

// a zero offer amount means "delete this offer", not a transfer of 0
function offerAmount(stroops: unknown, of: unknown): TxFlow["amount"] {
  return str(stroops) === "0" ? null : amount(stroops, of);
}

function pair(selling: unknown, buying: unknown): TxTarget | null {
  const from = asset(selling);
  const into = asset(buying);
  return from && into ? { kind: "pair", from, to: into } : null;
}

function hostFunctionTarget(fn: unknown): TxTarget | null {
  if (typeof fn !== "object" || fn === null) return null;
  const f = fn as Details;
  const call = f.invoke_contract as Details | undefined;
  if (call) return to(call.contract_address, str(call.function_name) ?? undefined);
  if ("create_contract" in f || "create_contract_v2" in f) {
    return { kind: "label", text: "New contract" };
  }
  if ("upload_contract_wasm" in f) return { kind: "label", text: "Contract code upload" };
  return null;
}

type OpFlow = Pick<TxFlow, "to" | "amount">;

export function detailsFlow(type: string, details: unknown): OpFlow {
  // account_merge has a bare destination as its body
  if (type === "account_merge" && typeof details === "string") {
    return { to: to(details), amount: null };
  }
  if (typeof details !== "object" || details === null) return { to: null, amount: null };
  const d = details as Details;

  switch (type) {
    case "payment":
      return { to: to(d.destination), amount: amount(d.amount, d.asset) };
    case "path_payment_strict_send":
      return { to: to(d.destination), amount: amount(d.send_amount, d.send_asset) };
    case "path_payment_strict_receive":
      return { to: to(d.destination), amount: amount(d.dest_amount, d.dest_asset) };
    case "create_account":
      return { to: to(d.destination), amount: amount(d.starting_balance, "native") };
    case "account_merge":
      return { to: to(d.destination), amount: null };
    case "manage_sell_offer":
    case "create_passive_sell_offer":
      return { to: pair(d.selling, d.buying), amount: offerAmount(d.amount, d.selling) };
    case "manage_buy_offer":
      return { to: pair(d.selling, d.buying), amount: offerAmount(d.buy_amount, d.buying) };
    case "change_trust": {
      // a classic asset is "CODE:ISSUER", anything else is a pool share line
      const line = str(d.line);
      const ref = line?.includes(":") ? asset(line) : null;
      return {
        to: ref ? { kind: "asset", asset: ref } : { kind: "label", text: "Pool shares" },
        amount: null,
      };
    }
    case "create_claimable_balance": {
      const first = Array.isArray(d.claimants) ? (d.claimants[0] as Details | undefined) : undefined;
      const claimant = (first?.v0 ?? first) as Details | undefined;
      return { to: to(claimant?.destination), amount: amount(d.amount, d.asset) };
    }
    case "begin_sponsoring_future_reserves":
      return { to: to(d.sponsored_id), amount: null };
    case "liquidity_pool_deposit":
    case "liquidity_pool_withdraw":
      return { to: { kind: "label", text: "Liquidity pool" }, amount: null };
    case "invoke_host_function":
      return { to: hostFunctionTarget(d.host_function), amount: null };
    default:
      return { to: null, amount: null };
  }
}

/** Flow of the first operation that targets something, else the first one. */
export function indexedFlow(ops: IndexedOp[], txSource: string): TxFlow {
  let fallback: TxFlow | null = null;
  for (const op of ops) {
    const flow: TxFlow = {
      from: op.source ?? txSource,
      ...detailsFlow(op.type, op.details),
      moreOps: ops.length - 1,
    };
    if (flow.to) return flow;
    fallback ??= flow;
  }
  return fallback ?? { from: txSource, to: null, amount: null, moreOps: Math.max(ops.length - 1, 0) };
}
