import { Address, Asset, MuxedAccount, getLiquidityPoolId, xdr } from "@stellar/stellar-sdk";
import type { OperationRecord } from "../transactions";

// The indexer stores each operation body as the XDR in JSON ("details").
// Pages and humanize.ts read Horizon's operation records, so this rebuilds
// one from an indexer row: renamed fields, split assets, 7-decimal amounts

type Details = Record<string, unknown>;
type Fields = Record<string, unknown>;

/** One operations row, with its transaction's hash. */
export interface IndexedOpRow {
  id: string;
  type: number;
  type_name: string;
  source_account: string;
  source_account_muxed: string;
  details: unknown;
  successful: boolean;
  closedAt: string;
  txHash: string;
}

/** A token_transfers row of the same operation. */
export interface OpTransfer {
  asset: string;
  from: string;
  to: string;
  amount: string;
  position: number;
}

const ACCOUNT_FLAGS = ["auth_required", "auth_revocable", "auth_immutable", "auth_clawback_enabled"];
const TRUSTLINE_FLAGS = ["authorized", "authorized_to_maintain_liabilities", "clawback_enabled"];
const HOST_FN = "HostFunctionTypeHostFunctionType";

// stroops -> Horizon's fixed 7 decimals ("1.5000000"), "" when not a number
export function horizonAmount(stroops: unknown): string {
  const s = typeof stroops === "bigint" || typeof stroops === "number" ? String(stroops) : stroops;
  if (typeof s !== "string" || !/^-?\d+$/.test(s)) return "";
  const value = BigInt(s);
  const abs = value < 0n ? -value : value;
  const frac = (abs % 10_000_000n).toString().padStart(7, "0");
  return `${value < 0n ? "-" : ""}${abs / 10_000_000n}.${frac}`;
}

// {n, d} -> "0.1766628", rounded half up
function horizonPrice(price: unknown): string {
  const { n, d } = (price ?? {}) as { n?: number; d?: number };
  if (!n || !d) return "";
  return horizonAmount((BigInt(n) * 20_000_000n + BigInt(d)) / (2n * BigInt(d)));
}

// "native" or "CODE:ISSUER" -> asset_type / asset_code / asset_issuer, under a prefix
function assetFields(value: unknown, prefix = ""): Fields {
  if (value === "native") return { [`${prefix}asset_type`]: "native" };
  if (typeof value !== "string" || !value.includes(":")) return {};
  const [code, issuer] = value.split(":");
  return {
    [`${prefix}asset_type`]: code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12",
    [`${prefix}asset_code`]: code,
    [`${prefix}asset_issuer`]: issuer,
  };
}

// M... -> its G... account, which is what pages compare against
function baseAccount(value: unknown): string {
  if (typeof value !== "string") return "";
  if (!value.startsWith("M")) return value;
  try {
    return MuxedAccount.fromAddress(value, "0").baseAccount().accountId();
  } catch {
    return value;
  }
}

// bit i set -> names[i]
function flagNames(value: unknown, names: string[]): string[] | undefined {
  if (typeof value !== "number" || value === 0) return undefined;
  const set = names.filter((_, i) => value & (1 << i));
  return set.length ? set : undefined;
}

function defined(fields: Fields): Fields {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null));
}

function toAsset(value: string): Asset {
  if (value === "native") return Asset.native();
  const [code, issuer] = value.split(":");
  return new Asset(code, issuer);
}

// a pool trustline names the pool by its assets and fee; Horizon shows the id
function poolId(line: unknown): string {
  const pool = (line as { liquidity_pool?: { constant_product?: { asset_a: string; asset_b: string; fee: number } } })
    ?.liquidity_pool?.constant_product;
  if (!pool) return "";
  try {
    return getLiquidityPoolId("constant_product", {
      assetA: toAsset(pool.asset_a),
      assetB: toAsset(pool.asset_b),
      fee: pool.fee,
    }).toString("hex");
  } catch {
    return "";
  }
}

// data values come as hex, Horizon has base64
function dataValue(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return /^([0-9a-f]{2})+$/i.test(value) ? Buffer.from(value, "hex").toString("base64") : value;
}

// A path payment stores the limit for one side only, the transfers have what
// moved. The last transfer from the sender to the destination is the delivery,
// what the sender paid in for it is everything else it sent in the send asset.
// A failed one moved nothing, Horizon shows 0
function pathAmounts(
  source: string,
  destination: string,
  d: Details,
  transfers: OpTransfer[],
  successful: boolean,
): { sent: bigint; received: bigint } | null {
  if (!successful) return { sent: 0n, received: 0n };
  const sorted = [...transfers].sort((a, b) => a.position - b.position);
  let delivery = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i];
    if (t.from === source && t.to === destination && t.asset === d.dest_asset) {
      delivery = i;
      break;
    }
  }
  if (delivery < 0) return null;
  const received = BigInt(sorted[delivery].amount);
  const sent = sorted
    .filter((t, i) => i !== delivery && t.from === source && t.asset === d.send_asset)
    .reduce((sum, t) => sum + BigInt(t.amount), 0n);
  return { sent: sent > 0n ? sent : received, received };
}

// Horizon's parameters start with the contract and the function as base64
// ScVals, which is all a feed sentence reads
function hostFunction(fn: unknown): Fields {
  const [kind, body] = Object.entries((fn ?? {}) as Record<string, unknown>)[0] ?? [];
  if (kind === "invoke_contract") {
    const call = body as { contract_address?: string; function_name?: string };
    let parameters: Array<{ type: string; value: string }> = [];
    try {
      parameters = [
        { type: "Address", value: Address.fromString(call.contract_address ?? "").toScVal().toXDR("base64") },
        { type: "Sym", value: xdr.ScVal.scvSymbol(call.function_name ?? "").toXDR("base64") },
      ];
    } catch {
      // the sentence falls back to "invoked a contract function"
    }
    return { function: `${HOST_FN}InvokeContract`, parameters };
  }
  if (kind?.startsWith("create_contract")) return { function: `${HOST_FN}CreateContract` };
  if (kind === "wasm" || kind === "upload_contract_wasm") {
    return { function: `${HOST_FN}UploadContractWasm` };
  }
  return { function: kind ?? "" };
}

function bodyFields(
  type: string,
  d: Details,
  source: string,
  transfers: OpTransfer[],
  successful: boolean,
): Fields {
  switch (type) {
    case "create_account":
      return {
        funder: source,
        account: baseAccount(d.destination),
        starting_balance: horizonAmount(d.starting_balance),
      };
    case "payment":
      return {
        from: source,
        to: baseAccount(d.destination),
        amount: horizonAmount(d.amount),
        ...assetFields(d.asset),
      };
    case "path_payment_strict_send": {
      const to = baseAccount(d.destination);
      const moved = pathAmounts(source, to, d, transfers, successful);
      return {
        from: source,
        to,
        source_amount: horizonAmount(d.send_amount),
        amount: horizonAmount(moved?.received ?? d.dest_min),
        destination_min: horizonAmount(d.dest_min),
        ...assetFields(d.send_asset, "source_"),
        ...assetFields(d.dest_asset),
      };
    }
    case "path_payment_strict_receive": {
      const to = baseAccount(d.destination);
      const moved = pathAmounts(source, to, d, transfers, successful);
      return {
        from: source,
        to,
        source_amount: horizonAmount(moved?.sent ?? d.send_max),
        source_max: horizonAmount(d.send_max),
        amount: horizonAmount(d.dest_amount),
        ...assetFields(d.send_asset, "source_"),
        ...assetFields(d.dest_asset),
      };
    }
    case "manage_sell_offer":
    case "create_passive_sell_offer":
    case "manage_buy_offer":
      return {
        amount: horizonAmount(type === "manage_buy_offer" ? d.buy_amount : d.amount),
        price: horizonPrice(d.price),
        price_r: d.price,
        ...(type === "create_passive_sell_offer" ? {} : { offer_id: String(d.offer_id ?? "0") }),
        ...assetFields(d.selling, "selling_"),
        ...assetFields(d.buying, "buying_"),
      };
    case "set_options": {
      const signer = d.signer as { key?: string; weight?: number } | null;
      return defined({
        home_domain: d.home_domain,
        inflation_dest: d.inflation_dest,
        master_key_weight: d.master_weight,
        low_threshold: d.low_threshold,
        med_threshold: d.med_threshold,
        high_threshold: d.high_threshold,
        signer_key: signer?.key,
        signer_weight: signer?.weight,
        set_flags_s: flagNames(d.set_flags, ACCOUNT_FLAGS),
        clear_flags_s: flagNames(d.clear_flags, ACCOUNT_FLAGS),
      });
    }
    case "change_trust":
      return {
        trustor: source,
        limit: horizonAmount(d.limit),
        ...(typeof d.line === "object" && d.line !== null
          ? { asset_type: "liquidity_pool_shares", liquidity_pool_id: poolId(d.line) }
          : assetFields(d.line)),
      };
    case "allow_trust":
      // the asset is a bare code, issued by the account authorizing
      return {
        trustee: source,
        trustor: d.trustor,
        authorize: d.authorize === 1,
        authorize_to_maintain_liabilities: d.authorize === 2,
        ...assetFields(`${d.asset}:${source}`),
      };
    case "account_merge":
      return { account: source, into: baseAccount(d.destination) };
    case "manage_data":
      return { name: d.data_name, value: dataValue(d.data_value) };
    case "bump_sequence":
      return { bump_to: String(d.bump_to ?? "") };
    case "create_claimable_balance":
      return {
        asset: d.asset,
        amount: horizonAmount(d.amount),
        claimants: ((d.claimants as Array<{ v0?: Fields }> | undefined) ?? []).map((c) => ({
          destination: c.v0?.destination,
          predicate: c.v0?.predicate,
        })),
      };
    case "claim_claimable_balance":
      return { claimant: source, balance_id: d.balance_id };
    case "clawback_claimable_balance":
      return { balance_id: d.balance_id };
    case "begin_sponsoring_future_reserves":
      return { sponsored_id: d.sponsored_id };
    case "revoke_sponsorship": {
      // the sponsored entry is nested several ways; the account it belongs to
      // is enough for the sentence
      const account = JSON.stringify(d).match(/G[A-Z2-7]{55}/)?.[0];
      return account ? { account_id: account } : {};
    }
    case "clawback":
      return { from: baseAccount(d.from), amount: horizonAmount(d.amount), ...assetFields(d.asset) };
    case "set_trust_line_flags":
      return defined({
        trustor: d.trustor,
        ...assetFields(d.asset),
        set_flags_s: flagNames(d.set_flags, TRUSTLINE_FLAGS),
        clear_flags_s: flagNames(d.clear_flags, TRUSTLINE_FLAGS),
      });
    case "liquidity_pool_deposit":
      // shares received is a result, the indexer keeps only the request
      return {
        liquidity_pool_id: d.liquidity_pool_id,
        min_price: horizonPrice(d.min_price),
        max_price: horizonPrice(d.max_price),
      };
    case "liquidity_pool_withdraw":
      return { liquidity_pool_id: d.liquidity_pool_id, shares: horizonAmount(d.amount) };
    case "invoke_host_function":
      return hostFunction(d.host_function);
    case "extend_footprint_ttl":
      return { extend_to: d.extend_to };
    default:
      return {};
  }
}

/** An indexer operation as Horizon would return it. `transfers` only matter for path payments. */
export function toOperationRecord(row: IndexedOpRow, transfers: OpTransfer[] = []): OperationRecord {
  const details = (row.details ?? {}) as Details;
  return {
    id: row.id,
    paging_token: row.id,
    transaction_successful: row.successful,
    source_account: row.source_account,
    ...(row.source_account_muxed ? { source_account_muxed: row.source_account_muxed } : {}),
    type: row.type_name,
    type_i: row.type,
    created_at: row.closedAt,
    transaction_hash: row.txHash,
    ...bodyFields(row.type_name, details, row.source_account, transfers, row.successful),
  } as unknown as OperationRecord;
}
