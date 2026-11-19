import type { BalanceLine } from "./accounts";
import { holdingUsd, type PriceBook } from "./prices";

// an account's balances as the Balances card lists them: valued, sorted,
// filtered, and an issuer's pile of unpriced tokens folded into one row.
// Pure and client-safe, the card sorts and filters in the browser

export interface Holding {
  /** `native`, `CODE:ISSUER`, or the pool id for pool shares. */
  key: string;
  kind: "native" | "issued" | "pool";
  code: string;
  issuer: string | null;
  /** Decimal string as Horizon returns it. */
  amount: string;
  /** Null when nothing prices it. */
  usd: number | null;
}

export type HoldingSort = "value" | "name";

export type HoldingEntry =
  | { kind: "holding"; holding: Holding }
  | { kind: "issuer"; issuer: string; holdings: Holding[] };

/** This many unpriced assets of one issuer or more fold into one row. */
export const FOLD_AT = 3;

export function toHoldings(balances: BalanceLine[], book: PriceBook | null): Holding[] {
  const usd = (key: string, amount: string) => (book ? holdingUsd(book, key, Number(amount)) : null);
  return balances.map((b): Holding => {
    if (b.asset_type === "native") {
      return { key: "native", kind: "native", code: "XLM", issuer: null, amount: b.balance, usd: usd("native", b.balance) };
    }
    if (b.asset_type === "liquidity_pool_shares") {
      return { key: b.liquidity_pool_id, kind: "pool", code: "Pool shares", issuer: null, amount: b.balance, usd: null };
    }
    const key = `${b.asset_code}:${b.asset_issuer}`;
    return { key, kind: "issued", code: b.asset_code, issuer: b.asset_issuer, amount: b.balance, usd: usd(key, b.balance) };
  });
}

const isEmpty = (h: Holding) => !/[1-9]/.test(h.amount);

function byName(a: Holding, b: Holding): number {
  return a.code.localeCompare(b.code, "en", { sensitivity: "base" }) || a.key.localeCompare(b.key);
}

// priced by value, then unpriced by name, empty trustlines last
function byValue(a: Holding, b: Holding): number {
  if (isEmpty(a) !== isEmpty(b)) return isEmpty(a) ? 1 : -1;
  if ((a.usd === null) !== (b.usd === null)) return a.usd === null ? 1 : -1;
  return (b.usd ?? 0) - (a.usd ?? 0) || byName(a, b);
}

export function sortHoldings(holdings: Holding[], sort: HoldingSort): Holding[] {
  return [...holdings].sort(sort === "value" ? byValue : byName);
}

/**
 * Sorted rows, with each issuer's unpriced assets folded into one row once
 * there are FOLD_AT of them. Folded issuers come after the single rows, the
 * biggest first: they're nearly always airdropped tokens. By value, empty
 * trustlines come after them, they hold nothing at all.
 */
export function arrangeHoldings(holdings: Holding[], sort: HoldingSort): HoldingEntry[] {
  const sorted = sortHoldings(holdings, sort);
  const unpriced = new Map<string, Holding[]>();
  for (const h of sorted) {
    if (h.issuer && h.usd === null) unpriced.set(h.issuer, [...(unpriced.get(h.issuer) ?? []), h]);
  }
  const folded = new Set([...unpriced].filter(([, list]) => list.length >= FOLD_AT).map(([issuer]) => issuer));
  const singles: HoldingEntry[] = sorted
    .filter((h) => !(h.issuer && h.usd === null && folded.has(h.issuer)))
    .map((holding) => ({ kind: "holding", holding }));
  const groups: HoldingEntry[] = [...folded]
    .map((issuer) => ({ kind: "issuer" as const, issuer, holdings: unpriced.get(issuer)! }))
    .sort((a, b) => b.holdings.length - a.holdings.length || a.issuer.localeCompare(b.issuer));
  if (sort === "name") return [...singles, ...groups];
  const empty = (e: HoldingEntry) => e.kind === "holding" && isEmpty(e.holding);
  return [...singles.filter((e) => !empty(e)), ...groups, ...singles.filter(empty)];
}

/** Matches on the code, the issuer or the pool id, any case. */
export function matchesHolding(h: Holding, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return h.code.toLowerCase().includes(q) || (h.issuer ?? h.key).toLowerCase().includes(q);
}

/** The priced holdings' sum (null when none is priced) and how many held assets have no price. */
export function holdingTotals(holdings: Holding[]): { usd: number | null; unpriced: number } {
  const priced = holdings.filter((h) => h.usd !== null);
  return {
    usd: priced.length ? priced.reduce((sum, h) => sum + h.usd!, 0) : null,
    unpriced: holdings.filter((h) => h.usd === null && !isEmpty(h)).length,
  };
}
