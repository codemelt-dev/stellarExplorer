import type { OperationRecord } from "./transactions";
import { decodeScAddress, decodeScSymbol } from "./scLite";
import { CONTRACT_TYPES, PAYMENT_TYPES } from "./opFilters";

// one label for the whole tx, derived from its op types
export function txTypeLabel(
  types: string[],
): { label: string; tone: "contract" | "neutral" } | null {
  if (types.length === 0) return null;
  if (types.every((t) => CONTRACT_TYPES.has(t))) {
    return {
      label: types.length > 1 ? `${types.length} contract calls` : opBadge(types[0]).label,
      tone: "contract",
    };
  }
  if (types.every((t) => PAYMENT_TYPES.has(t))) {
    return {
      label: types.length > 1 ? "multi send" : opBadge(types[0]).label,
      tone: "neutral",
    };
  }
  if (types.length === 1) return opBadge(types[0]);
  return { label: `${types.length} operations`, tone: "neutral" };
}

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "address"; address: string }
  | { kind: "amount"; amount: string; assetCode: string; assetIssuer?: string }
  | { kind: "asset"; assetCode: string; assetIssuer?: string }
  | { kind: "code"; text: string };

const t = (text: string): Segment => ({ kind: "text", text });
const addr = (address: string): Segment => ({ kind: "address", address });
const code = (text: string): Segment => ({ kind: "code", text });

function amt(amount: string, assetType?: string, assetCode?: string, assetIssuer?: string): Segment {
  if (!assetType || assetType === "native") {
    return { kind: "amount", amount, assetCode: "XLM" };
  }
  return { kind: "amount", amount, assetCode: assetCode ?? "?", assetIssuer };
}

function asset(assetType?: string, assetCode?: string, assetIssuer?: string): Segment {
  if (!assetType || assetType === "native") return { kind: "asset", assetCode: "XLM" };
  return { kind: "asset", assetCode: assetCode ?? "?", assetIssuer };
}

/** "USDC:GA5Z..." claimable-balance asset string -> asset segment */
function assetFromColonString(s: string): Segment {
  if (s === "native") return { kind: "asset", assetCode: "XLM" };
  const [assetCode, assetIssuer] = s.split(":");
  return { kind: "asset", assetCode, assetIssuer };
}

// Horizon op records are a wide union; we read fields dynamically but keep
// every access inside this module.
type AnyOp = OperationRecord & Record<string, unknown>;

function str(op: AnyOp, field: string): string {
  const v = op[field];
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

// variant for an account's own page: verb-first, and flips to "received"
// when the account is on the receiving end
export function humanizeOperationFor(
  record: OperationRecord,
  self: string,
): Segment[] {
  const op = record as AnyOp;

  switch (record.type as string) {
    case "payment":
    case "path_payment_strict_receive":
    case "path_payment_strict_send": {
      const amount = amt(
        str(op, "amount"),
        str(op, "asset_type"),
        str(op, "asset_code"),
        str(op, "asset_issuer"),
      );
      if (str(op, "to") === self && str(op, "from") !== self) {
        return [t("received "), amount, t(" from "), addr(str(op, "from"))];
      }
      if (str(op, "from") === self) {
        return [t("sent "), amount, t(" to "), addr(str(op, "to"))];
      }
      break;
    }
    case "create_account": {
      if (str(op, "account") === self) {
        return [
          t("created with "),
          amt(str(op, "starting_balance")),
          t(" by "),
          addr(str(op, "funder")),
        ];
      }
      if (str(op, "funder") === self) {
        return [
          t("created account "),
          addr(str(op, "account")),
          t(" with "),
          amt(str(op, "starting_balance")),
        ];
      }
      break;
    }
    case "account_merge": {
      if (str(op, "into") === self) {
        return [t("absorbed "), addr(str(op, "account"))];
      }
      break;
    }
  }

  // Generic: drop a leading segment that just repeats the page's account.
  const segments = humanizeOperation(record);
  if (segments[0]?.kind === "address" && segments[0].address === self) {
    const rest = segments.slice(1);
    if (rest[0]?.kind === "text") {
      rest[0] = { kind: "text", text: rest[0].text.replace(/^ /, "") };
    }
    return rest;
  }
  return segments;
}

export interface OpBadge {
  label: string;
  /** "contract" renders violet - Soroban is scannable in any list. */
  tone: "contract" | "neutral";
}

/** Compact action badge per op type. */
export function opBadge(type: string): OpBadge {
  switch (type) {
    case "invoke_host_function":
      return { label: "invoke", tone: "contract" };
    case "extend_footprint_ttl":
    case "restore_footprint":
      return { label: "soroban", tone: "contract" };
    case "payment":
      return { label: "payment", tone: "neutral" };
    case "path_payment_strict_receive":
    case "path_payment_strict_send":
      return { label: "path payment", tone: "neutral" };
    case "create_account":
      return { label: "create", tone: "neutral" };
    case "account_merge":
      return { label: "merge", tone: "neutral" };
    case "change_trust":
    case "allow_trust":
    case "set_trust_line_flags":
      return { label: "trustline", tone: "neutral" };
    case "manage_sell_offer":
    case "manage_buy_offer":
    case "create_passive_sell_offer":
      return { label: "trade", tone: "neutral" };
    case "liquidity_pool_deposit":
    case "liquidity_pool_withdraw":
      return { label: "pool", tone: "neutral" };
    case "create_claimable_balance":
    case "claim_claimable_balance":
    case "clawback_claimable_balance":
      return { label: "claimable", tone: "neutral" };
    case "begin_sponsoring_future_reserves":
    case "end_sponsoring_future_reserves":
    case "revoke_sponsorship":
      return { label: "sponsorship", tone: "neutral" };
    case "clawback":
      return { label: "clawback", tone: "neutral" };
    case "manage_data":
      return { label: "data", tone: "neutral" };
    case "set_options":
      return { label: "options", tone: "neutral" };
    case "bump_sequence":
      return { label: "sequence", tone: "neutral" };
    default:
      return { label: type.replace(/_/g, " "), tone: "neutral" };
  }
}

export function humanizeOperation(record: OperationRecord): Segment[] {
  const op = record as AnyOp;
  const source = str(op, "source_account");

  // Horizon's real `type` strings are ahead of the SDK's enum typings
  // (e.g. manage_buy_offer, extend_footprint_ttl) - compare as plain strings.
  switch (record.type as string) {
    case "create_account":
      return [
        addr(str(op, "funder")),
        t(" created account "),
        addr(str(op, "account")),
        t(" with "),
        amt(str(op, "starting_balance")),
      ];

    case "payment":
      return [
        addr(str(op, "from")),
        t(" sent "),
        amt(str(op, "amount"), str(op, "asset_type"), str(op, "asset_code"), str(op, "asset_issuer")),
        t(" to "),
        addr(str(op, "to")),
      ];

    case "path_payment_strict_receive":
      return [
        addr(str(op, "from")),
        t(" sent "),
        amt(str(op, "source_amount"), str(op, "source_asset_type"), str(op, "source_asset_code"), str(op, "source_asset_issuer")),
        t(" → "),
        amt(str(op, "amount"), str(op, "asset_type"), str(op, "asset_code"), str(op, "asset_issuer")),
        t(" to "),
        addr(str(op, "to")),
        t(" via path payment"),
      ];

    case "path_payment_strict_send":
      return [
        addr(str(op, "from")),
        t(" sent "),
        amt(str(op, "source_amount"), str(op, "source_asset_type"), str(op, "source_asset_code"), str(op, "source_asset_issuer")),
        t(" → "),
        amt(str(op, "amount"), str(op, "asset_type"), str(op, "asset_code"), str(op, "asset_issuer")),
        t(" to "),
        addr(str(op, "to")),
        t(" via path payment"),
      ];

    case "manage_sell_offer": {
      const amount = str(op, "amount");
      const offerId = str(op, "offer_id");
      if (amount === "0.0000000" && offerId !== "0") {
        return [addr(source), t(" cancelled sell offer "), code(`#${offerId}`)];
      }
      return [
        addr(source),
        t(`${offerId === "0" ? " created" : " updated"} sell offer: `),
        amt(amount, str(op, "selling_asset_type"), str(op, "selling_asset_code"), str(op, "selling_asset_issuer")),
        t(" for "),
        asset(str(op, "buying_asset_type"), str(op, "buying_asset_code"), str(op, "buying_asset_issuer")),
        t(" at "),
        code(str(op, "price")),
      ];
    }

    case "manage_buy_offer": {
      const amount = str(op, "amount");
      const offerId = str(op, "offer_id");
      if (amount === "0.0000000" && offerId !== "0") {
        return [addr(source), t(" cancelled buy offer "), code(`#${offerId}`)];
      }
      return [
        addr(source),
        t(`${offerId === "0" ? " created" : " updated"} buy offer: `),
        amt(amount, str(op, "buying_asset_type"), str(op, "buying_asset_code"), str(op, "buying_asset_issuer")),
        t(" paying with "),
        asset(str(op, "selling_asset_type"), str(op, "selling_asset_code"), str(op, "selling_asset_issuer")),
        t(" at "),
        code(str(op, "price")),
      ];
    }

    case "create_passive_sell_offer":
      return [
        addr(source),
        t(" created passive sell offer: "),
        amt(str(op, "amount"), str(op, "selling_asset_type"), str(op, "selling_asset_code"), str(op, "selling_asset_issuer")),
        t(" for "),
        asset(str(op, "buying_asset_type"), str(op, "buying_asset_code"), str(op, "buying_asset_issuer")),
        t(" at "),
        code(str(op, "price")),
      ];

    case "set_options": {
      const details: string[] = [];
      if (op["home_domain"]) details.push(`home domain → ${str(op, "home_domain")}`);
      if (op["signer_key"]) details.push(`signer ${str(op, "signer_key").slice(0, 4)}… weight ${str(op, "signer_weight")}`);
      if (op["master_key_weight"] !== undefined) details.push(`master weight → ${str(op, "master_key_weight")}`);
      if (op["low_threshold"] !== undefined) details.push(`thresholds ${str(op, "low_threshold")}/${str(op, "med_threshold")}/${str(op, "high_threshold")}`);
      if (op["set_flags_s"]) details.push(`set flags ${(op["set_flags_s"] as string[]).join(", ")}`);
      if (op["clear_flags_s"]) details.push(`clear flags ${(op["clear_flags_s"] as string[]).join(", ")}`);
      if (op["inflation_dest"]) details.push("inflation destination");
      return [
        addr(source),
        t(" updated account options"),
        ...(details.length ? [t(": "), code(details.join(" · "))] : []),
      ];
    }

    case "change_trust": {
      const limit = str(op, "limit");
      const removing = limit === "0.0000000";
      if (str(op, "asset_type") === "liquidity_pool_shares") {
        return [
          addr(str(op, "trustor")),
          t(removing ? " removed trustline to liquidity pool " : " added trustline to liquidity pool "),
          code(str(op, "liquidity_pool_id").slice(0, 8) + "…"),
        ];
      }
      return [
        addr(str(op, "trustor")),
        t(removing ? " removed trustline to " : " added trustline to "),
        asset(str(op, "asset_type"), str(op, "asset_code"), str(op, "asset_issuer")),
      ];
    }

    case "allow_trust":
      return [
        addr(str(op, "trustee")),
        t(op["authorize"] ? " authorized " : " deauthorized "),
        addr(str(op, "trustor")),
        t(" to hold "),
        asset(str(op, "asset_type"), str(op, "asset_code"), str(op, "asset_issuer")),
      ];

    case "account_merge":
      return [
        addr(str(op, "account")),
        t(" merged into "),
        addr(str(op, "into")),
      ];

    case "inflation":
      return [addr(source), t(" ran inflation")];

    case "manage_data": {
      const value = op["value"];
      return [
        addr(source),
        t(value ? " set data entry " : " deleted data entry "),
        code(str(op, "name")),
      ];
    }

    case "bump_sequence":
      return [addr(source), t(" bumped sequence to "), code(str(op, "bump_to"))];

    case "create_claimable_balance":
      return [
        addr(source),
        t(" created claimable balance of "),
        (() => {
          const s = assetFromColonString(str(op, "asset"));
          return {
            kind: "amount",
            amount: str(op, "amount"),
            assetCode: s.kind === "asset" ? s.assetCode : "?",
            assetIssuer: s.kind === "asset" ? s.assetIssuer : undefined,
          } as Segment;
        })(),
        t(` for ${(op["claimants"] as unknown[] | undefined)?.length ?? "?"} claimant(s)`),
      ];

    case "claim_claimable_balance":
      return [
        addr(str(op, "claimant")),
        t(" claimed balance "),
        code(str(op, "balance_id").slice(0, 8) + "…"),
      ];

    case "begin_sponsoring_future_reserves":
      return [
        addr(source),
        t(" began sponsoring reserves for "),
        addr(str(op, "sponsored_id")),
      ];

    case "end_sponsoring_future_reserves":
      return [addr(source), t(" ended reserve sponsorship")];

    case "revoke_sponsorship": {
      const target =
        str(op, "account_id") ||
        str(op, "trustline_account_id") ||
        str(op, "offer_id") ||
        str(op, "data_account_id") ||
        str(op, "claimable_balance_id") ||
        str(op, "signer_account_id");
      return [
        addr(source),
        t(" revoked sponsorship"),
        ...(target ? [t(" of "), target.startsWith("G") ? addr(target) : code(target)] : []),
      ];
    }

    case "clawback":
      return [
        addr(source),
        t(" clawed back "),
        amt(str(op, "amount"), str(op, "asset_type"), str(op, "asset_code"), str(op, "asset_issuer")),
        t(" from "),
        addr(str(op, "from")),
      ];

    case "clawback_claimable_balance":
      return [
        addr(source),
        t(" clawed back claimable balance "),
        code(str(op, "balance_id").slice(0, 8) + "…"),
      ];

    case "set_trust_line_flags": {
      const set = (op["set_flags_s"] as string[] | undefined) ?? [];
      const clear = (op["clear_flags_s"] as string[] | undefined) ?? [];
      const parts = [
        ...(set.length ? [`set ${set.join(", ")}`] : []),
        ...(clear.length ? [`cleared ${clear.join(", ")}`] : []),
      ];
      return [
        addr(source),
        t(" changed trustline flags for "),
        addr(str(op, "trustor")),
        t(" on "),
        asset(str(op, "asset_type"), str(op, "asset_code"), str(op, "asset_issuer")),
        ...(parts.length ? [t(": "), code(parts.join(" · "))] : []),
      ];
    }

    case "liquidity_pool_deposit":
      return [
        addr(source),
        t(" deposited into liquidity pool "),
        code(str(op, "liquidity_pool_id").slice(0, 8) + "…"),
        t(", received "),
        code(`${str(op, "shares_received")} shares`),
      ];

    case "liquidity_pool_withdraw":
      return [
        addr(source),
        t(" withdrew "),
        code(`${str(op, "shares")} shares`),
        t(" from liquidity pool "),
        code(str(op, "liquidity_pool_id").slice(0, 8) + "…"),
      ];

    case "invoke_host_function": {
      // Full arg detail is rendered by the op card from the decoded envelope
      // (parseSorobanInvocation); here we decode just function + contract
      // from Horizon's `parameters` so feeds read decoded-by-default.
      const fn = str(op, "function");
      if (fn.includes("InvokeContract")) {
        const params = op["parameters"] as
          | Array<{ value: string; type: string }>
          | undefined;
        if (params && params[0]?.type === "Address" && params[1]?.type === "Sym") {
          const contractId = decodeScAddress(params[0].value);
          const fnName = decodeScSymbol(params[1].value);
          if (contractId && fnName) {
            return [
              addr(source),
              t(" invoked "),
              code(fnName),
              t(" on "),
              addr(contractId),
            ];
          }
        }
        return [addr(source), t(" invoked a contract function")];
      }
      if (fn.includes("CreateContract")) {
        return [addr(source), t(" created a contract")];
      }
      if (fn.includes("UploadContractWasm") || fn.includes("UploadWasm")) {
        return [addr(source), t(" uploaded contract code")];
      }
      return [addr(source), t(" invoked a host function")];
    }

    case "extend_footprint_ttl":
      return [
        addr(source),
        t(" extended contract data TTL to ledger "),
        code(str(op, "extend_to")),
      ];

    case "restore_footprint":
      return [addr(source), t(" restored archived contract data")];

    default:
      // Safe generic fallback - never break the page on an unknown type.
      return [
        addr(source),
        t(" performed "),
        code(String((record as { type: string }).type).replace(/_/g, " ")),
      ];
  }
}
