export type HistoryFilter = "all" | "payments" | "trades" | "contracts";

export const PAYMENT_TYPES = new Set([
  "payment",
  "path_payment_strict_receive",
  "path_payment_strict_send",
  "create_account",
  "account_merge",
]);

export const TRADE_TYPES = new Set([
  "manage_sell_offer",
  "manage_buy_offer",
  "create_passive_sell_offer",
  "liquidity_pool_deposit",
  "liquidity_pool_withdraw",
]);

export const CONTRACT_TYPES = new Set([
  "invoke_host_function",
  "extend_footprint_ttl",
  "restore_footprint",
]);

export function matchesFilter(type: string, filter: HistoryFilter): boolean {
  if (filter === "all") return true;
  const set =
    filter === "payments"
      ? PAYMENT_TYPES
      : filter === "trades"
        ? TRADE_TYPES
        : CONTRACT_TYPES;
  return set.has(type);
}
