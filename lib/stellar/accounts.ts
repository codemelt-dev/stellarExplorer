import "server-only";
import { cache } from "react";
import { Horizon, MuxedAccount } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";
import { NotFoundError } from "./transactions";
import type { OperationRecord } from "./transactions";

export type AccountRecord = Horizon.ServerApi.AccountRecord;

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

export const getAccount = cache(async (id: string): Promise<AccountRecord> => {
  try {
    return await (await horizon()).accounts().accountId(id).call();
  } catch (error) {
    if (isHorizon404(error)) throw new NotFoundError("Account");
    throw error;
  }
});

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

// newest first, with real server-side filtering. Payments use Horizon's
// dedicated endpoint; trades and contract calls scan raw operations in
// bounded chunks until the page fills. Cursors always continue correctly
export const getAccountOperations = cache(
  async (
    id: string,
    options: {
      cursor?: string;
      direction?: "older" | "newer";
      limit?: number;
      filter?: HistoryFilter;
    } = {},
  ): Promise<OperationsPage> => {
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
        return getAccountOperations(id, { limit, filter });
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
      if (isHorizon404(error)) throw new NotFoundError("Account");
      throw error;
    }
  },
);

export type { HistoryFilter } from "./opFilters";
import { matchesFilter, type HistoryFilter } from "./opFilters";
