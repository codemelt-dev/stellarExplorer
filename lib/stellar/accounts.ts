import "server-only";
import { cache } from "react";
import { Horizon, MuxedAccount, StrKey } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";
import { NotFoundError } from "./transactions";
import type { OperationRecord } from "./transactions";
import { withIndexer } from "./indexer/client";
import { indexedAccount, indexedAccountOperations } from "./indexer/accounts";

export type BalanceLine =
  | { asset_type: "native"; balance: string }
  | { asset_type: "liquidity_pool_shares"; liquidity_pool_id: string; balance: string }
  | {
      asset_type: "credit_alphanum4" | "credit_alphanum12";
      asset_code: string;
      asset_issuer: string;
      balance: string;
    };

/** What the account page shows, from the indexer or Horizon. Field names follow Horizon. */
export interface AccountView {
  id: string;
  home_domain?: string;
  balances: BalanceLine[];
  signers: Array<{ key: string; weight: number }>;
  thresholds: { low_threshold: number; med_threshold: number; high_threshold: number };
  flags: Record<string, boolean>;
  sequence: string;
  subentry_count: number;
  num_sponsoring: number;
  num_sponsored: number;
  /** name -> base64 value */
  data_attr: Record<string, string>;
}

/** 404 = missing; 400 = malformed id - both render as "not found" upstream. */
function isHorizon404(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return false;
  }
  const status = (error as { response?: { status?: number } }).response?.status;
  return status === 404 || status === 400;
}

/** M... address -> base G address + muxed id, or null when not muxed. */
export function resolveMuxed(
  address: string,
): { base: string; muxedId: string } | null {
  if (!address.startsWith("M")) return null;
  try {
    const muxed = MuxedAccount.fromAddress(address, "0");
    return { base: muxed.baseAccount().accountId(), muxedId: muxed.id() };
  } catch {
    return null;
  }
}

function fromHorizon(record: Horizon.ServerApi.AccountRecord): AccountView {
  return {
    id: record.id,
    home_domain: record.home_domain,
    balances: record.balances.map((b): BalanceLine => {
      if (b.asset_type === "native") return { asset_type: "native", balance: b.balance };
      if (b.asset_type === "liquidity_pool_shares") {
        return { asset_type: "liquidity_pool_shares", liquidity_pool_id: b.liquidity_pool_id, balance: b.balance };
      }
      return {
        asset_type: b.asset_code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12",
        asset_code: b.asset_code,
        asset_issuer: b.asset_issuer,
        balance: b.balance,
      };
    }),
    signers: record.signers.map(({ key, weight }) => ({ key, weight })),
    thresholds: record.thresholds,
    flags: { ...record.flags },
    sequence: record.sequence,
    subentry_count: record.subentry_count,
    num_sponsoring: record.num_sponsoring,
    num_sponsored: record.num_sponsored,
    data_attr: record.data_attr ?? {},
  };
}

async function horizonAccount(id: string): Promise<AccountView> {
  try {
    return fromHorizon(await (await horizon()).accounts().accountId(id).call());
  } catch (error) {
    if (isHorizon404(error)) throw new NotFoundError("Account");
    throw error;
  }
}

export const getAccount = cache(
  (id: string): Promise<AccountView> =>
    withIndexer(
      "account",
      () => (StrKey.isValidEd25519PublicKey(id) ? indexedAccount(id) : Promise.resolve(null)),
      () => horizonAccount(id),
    ),
);

export interface OperationsPage {
  records: OperationRecord[];
  /** paging_token of the newest row, feeds the "Newer" link */
  prevCursor: string | null;
  /** paging_token of the oldest row, feeds the "Older" link */
  nextCursor: string | null;
  /** false once we know this is the newest page */
  hasNewer: boolean;
  hasOlder: boolean;
}

// how many raw ops we're willing to scan per request when a filter is on
const SCAN_PAGE = 200;
const MAX_SCANS = 4;

interface HistoryOptions {
  cursor?: string;
  direction?: "older" | "newer";
  limit?: number;
  filter?: HistoryFilter;
}

// newest first, filtered on the server. Mainnet reads the indexer; paging
// tokens are the same on both sources, so Older walks on into Horizon's
// history from before the indexer's go-live
export const getAccountOperations = cache(
  (id: string, options: HistoryOptions = {}): Promise<OperationsPage> =>
    withIndexer(
      "account history",
      () => indexedHistory(id, options),
      () => horizonOperations(id, options),
    ),
);

async function indexedHistory(id: string, options: HistoryOptions): Promise<OperationsPage | null> {
  if (!StrKey.isValidEd25519PublicKey(id)) return null;
  const { cursor, direction = "older", limit = 10, filter = "all" } = options;
  const goingNewer = direction === "newer" && !!cursor;
  const page = await indexedAccountOperations(id, {
    cursor,
    newer: goingNewer,
    limit,
    types: filterTypes(filter),
  });
  if (!page) return null;

  // walked past the top: serve the newest page instead of a dead empty one
  if (goingNewer && page.exhausted) return indexedHistory(id, { limit, filter });

  const { records } = page;
  return {
    records,
    prevCursor: records[0]?.paging_token ?? null,
    nextCursor: goingNewer ? (records[records.length - 1]?.paging_token ?? null) : page.cursor,
    hasNewer: !!cursor,
    hasOlder: goingNewer || !page.exhausted || (await olderOnHorizon(id, page.cursor)),
  };
}

// the indexer ran out going back: is there history from before it on Horizon?
async function olderOnHorizon(id: string, cursor: string): Promise<boolean> {
  try {
    const page = await (await horizon())
      .operations()
      .forAccount(id)
      .cursor(cursor)
      .order("desc")
      .limit(1)
      .call();
    return page.records.length > 0;
  } catch (error) {
    // 404 is no history there; otherwise can't tell, offer the link
    return !isHorizon404(error);
  }
}

// Payments use Horizon's dedicated endpoint; trades and contract calls scan
// raw operations in bounded chunks until the page fills. Cursors always
// continue correctly
async function horizonOperations(id: string, options: HistoryOptions): Promise<OperationsPage> {
  const { cursor, direction = "older", limit = 10, filter = "all" } = options;
  const goingNewer = direction === "newer" && !!cursor;
  try {
    const server = await horizon();
    const order: "asc" | "desc" = goingNewer ? "asc" : "desc";

    const makeBuilder = (from?: string | null) => {
      let b =
        filter === "payments"
          ? server.payments().forAccount(id).order(order).includeFailed(true)
          : server.operations().forAccount(id).order(order).includeFailed(true);
      if (from) b = b.cursor(from);
      return b;
    };

    // the payments endpoint filters on the server already; the rest we check
    const passes = (type: string) =>
      filter === "all" || filter === "payments"
        ? true
        : matchesFilter(type, filter);
    const needsScan = filter === "trades" || filter === "contracts";

    const matched: OperationRecord[] = [];
    let resumeToken: string | null = null;
    let exhausted = false;
    let scans = 0;

    while (
      matched.length < limit &&
      !exhausted &&
      scans < (needsScan ? MAX_SCANS : 1)
    ) {
      const pageSize = needsScan ? SCAN_PAGE : limit;
      const page = await makeBuilder(resumeToken ?? cursor)
        .limit(pageSize)
        .call();
      const records = page.records as unknown as OperationRecord[];
      scans++;
      if (records.length < pageSize) exhausted = true;
      for (const record of records) {
        resumeToken = record.paging_token;
        if (passes(record.type as string)) {
          matched.push(record);
          if (matched.length === limit) break;
        }
      }
      if (records.length === 0) break;
    }

    // walked off an edge (stale cursor, or newer past the top): serve the
    // newest page instead of a dead empty one
    if (cursor && goingNewer && matched.length < limit && exhausted) {
      return horizonOperations(id, { limit, filter });
    }

    const records = goingNewer ? [...matched].reverse() : matched;
    const full = matched.length === limit;
    return {
      records,
      prevCursor: records[0]?.paging_token ?? null,
      // resume from the last row we looked at, matched or not, so an
      // Older click keeps scanning instead of rereading the same ops
      nextCursor: full
        ? (records[records.length - 1]?.paging_token ?? null)
        : resumeToken,
      hasNewer: !!cursor,
      hasOlder: goingNewer ? true : full || !exhausted,
    };
  } catch (error) {
    // Horizon 404s the history of an account it holds no operations for (it
    // keeps a limited window). Whether the account exists is getAccount's call
    if (isHorizon404(error)) {
      return { records: [], prevCursor: null, nextCursor: null, hasNewer: !!cursor, hasOlder: false };
    }
    throw error;
  }
}

export type { HistoryFilter } from "./opFilters";
import { filterTypes, matchesFilter, type HistoryFilter } from "./opFilters";
