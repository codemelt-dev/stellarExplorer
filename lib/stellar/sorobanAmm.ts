import { StrKey } from "@stellar/stellar-sdk";

// Reading Soroswap and Aquarius pool events. Event data comes from the
// indexer as ScVal JSON: Aquarius reserves are a vec, Soroswap's sync a map

export type SorobanProtocol = "soroswap" | "aquarius";
export type PoolKind = "constant_product" | "stable" | "concentrated";

/** Soroswap charges every pair the same. */
export const SOROSWAP_FEE_BP = 30;

type ScJson = { vec?: Array<{ i128?: string; i32?: number }>; map?: Array<{ key: { symbol?: string }; val: { i128?: string } }> };

function parse(data: string): ScJson | null {
  try {
    return data ? (JSON.parse(data) as ScJson) : null;
  } catch {
    return null;
  }
}

const DIGITS = /^\d+$/;

/** Both reserves in base units, from update_reserves or sync. Null for anything else, or a pool of more than two tokens. */
export function reservesOf(data: string): [string, string] | null {
  const value = parse(data);
  let pair: Array<string | undefined> | null = null;
  if (value?.vec) pair = value.vec.map((v) => v.i128);
  else if (value?.map) {
    const field = (name: string) => value.map!.find((e) => e.key.symbol === name)?.val.i128;
    pair = [field("new_reserve_0"), field("new_reserve_1")];
  }
  if (pair?.length !== 2 || !pair.every((r) => r !== undefined && DIGITS.test(r))) return null;
  return pair as [string, string];
}

/** Token 1 per token 0 from a concentrated pool's pool_state (sqrt price, tick, liquidity). */
export function tickPrice(data: string): number | null {
  const tick = parse(data)?.vec?.[1]?.i32;
  return typeof tick === "number" ? 1.0001 ** tick : null;
}

/** Fee in basis points from a trade's fee / amount in. */
export const feeBpOf = (ratio: number): number | null => (ratio > 0 ? Math.round(ratio * 10_000) : null);

/** Pools keep their tokens sorted by contract id bytes, which isn't the order of the strkeys. */
export function sortTokens(tokens: string[]): string[] {
  return [...tokens].sort((a, b) => Buffer.compare(StrKey.decodeContract(a), StrKey.decodeContract(b)));
}

/** The token contract in an event topic like {"address":"C…"}. */
export function topicAddress(topic: string): string | null {
  try {
    const address = (JSON.parse(topic) as { address?: string }).address;
    return address && StrKey.isValidContract(address) ? address : null;
  } catch {
    return null;
  }
}

/** A trade or update_reserves event of an Aquarius pool, newest first. */
export interface AquariusEvent {
  trade: number | boolean;
  /** The trade's first topic after its name: the token that went in. */
  token_in: string;
  data: string;
}

const bigints = (data: string): bigint[] | null => {
  const vec = parse(data)?.vec;
  if (!vec?.every((v) => v.i128 !== undefined && /^-?\d+$/.test(v.i128))) return null;
  return vec.map((v) => BigInt(v.i128!));
};

/**
 * Whether a classic-style Aquarius pool is constant product or stable, its
 * fee and its price (B per A), read off a trade between two reserve updates.
 * A constant product pool's trade event reports the protocol's half of the
 * fee, which leaves the reserves; a stable pool's reports the whole fee and
 * keeps half of it. Null when no recent trade is big enough to tell.
 */
export function aquariusPool(
  events: AquariusEvent[],
  tokens: [string, string],
): { kind: "constant_product" | "stable"; feeBp: number; price: number } | null {
  for (let i = 0; i + 2 < events.length; i++) {
    const [after, trade, before] = events.slice(i, i + 3);
    if (after.trade || !trade.trade || before.trade) continue;
    const now = bigints(after.data);
    const then = bigints(before.data);
    const amounts = bigints(trade.data);
    const k = tokens.indexOf(topicAddress(trade.token_in) ?? "");
    if (!now || !then || now.length !== 2 || then.length !== 2 || amounts?.length !== 3 || k < 0) continue;
    const [amountIn, amountOut, fee] = amounts;
    // too small to tell a whole fee from half of one
    if (amountIn < 1_000_000n || fee < 100n || amountOut <= 0n) continue;
    const kept = now[k] - then[k];
    const off = (n: bigint) => (n < 0n ? -n : n);
    const kind =
      off(kept - (amountIn - fee)) <= 1n ? "constant_product" : off(kept - (amountIn - fee / 2n)) <= 2n ? "stable" : null;
    if (!kind) continue;
    const ratio = Number(fee) / Number(amountIn);
    const rate = Number(amountOut) / Number(amountIn);
    return {
      kind,
      feeBp: Math.round((kind === "constant_product" ? 2 : 1) * ratio * 10_000),
      price: k === 0 ? rate : 1 / rate,
    };
  }
  return null;
}
