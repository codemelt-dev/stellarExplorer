import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OpSentence } from "@/components/stellar/OpSentence";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { TimeExact } from "@/components/stellar/Time";
import { EmptyState } from "@/components/states/EmptyState";
import { LinkPending } from "@/components/layout/LinkPending";
import { humanizeOperationFor, opBadge } from "@/lib/stellar/humanize";
import type { HistoryFilter, OperationsPage } from "@/lib/stellar/accounts";
import { cn } from "@/lib/utils";
import { Loader2, XCircle } from "lucide-react";

const FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "payments", label: "Payments" },
  { id: "trades", label: "Trades" },
  { id: "contracts", label: "Contract calls" },
];

// a filtered page can take seconds on a busy account: while one loads the
// list dims, a spinner shows and the other links wait, so clicks can't pile up.
// The links don't prefetch, so the route's full-page skeleton never flashes in
// and the pending state shows in production too
const waiting = "group-has-[[data-pending]]/history:pointer-events-none";

// how far back a page reached: its cursor is a TOID, the ledger in the top bits
const ledgerOf = (cursor: string | null) => {
  try {
    return cursor ? Number(BigInt(cursor) >> 32n) : null;
  } catch {
    return null;
  }
};

// history table. Sentences are perspective-aware so the page's own account
// doesn't repeat in every row
export function HistoryFeed({
  baseHref,
  page,
  filter,
  limit,
  selfAddress,
}: {
  baseHref: string;
  page: OperationsPage;
  filter: HistoryFilter;
  limit: number;
  selfAddress: string;
}) {
  const filtered = page.records;
  const kind = filter === "contracts" ? "contract calls" : filter;
  const reached = ledgerOf(page.nextCursor);

  function href(params: Record<string, string | undefined>) {
    const search = new URLSearchParams();
    const merged = {
      ...(filter !== "all" ? { filter } : {}),
      ...(limit !== 10 ? { limit: String(limit) } : {}),
      ...params,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined) search.set(key, value);
    }
    const qs = search.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  }

  return (
    <Card className="group/history gap-4 p-5 has-[[data-pending]]:cursor-progress">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          History
          <Loader2
            className="hidden size-4 animate-spin text-dim group-has-[[data-pending]]/history:block motion-reduce:animate-none"
            aria-hidden="true"
          />
        </h2>
        <nav className="flex gap-1" aria-label="History filter">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              prefetch={false}
              href={href({ filter: f.id === "all" ? undefined : f.id, cursor: undefined, dir: undefined })}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors duration-150",
                waiting,
                f.id === filter
                  ? "bg-surface-2 text-foreground"
                  : "text-dim hover:text-foreground",
              )}
              aria-current={f.id === filter ? "page" : undefined}
            >
              {f.label}
              <LinkPending />
            </Link>
          ))}
        </nav>
      </div>

      <div className="transition-opacity duration-150 group-has-[[data-pending]]/history:opacity-50">
        {filtered.length === 0 ? (
          <EmptyState
            message={
              filter === "all"
                ? "No operations yet. This account hasn't transacted."
                : page.hasOlder
                  ? `No ${kind} in this account's newest transactions${reached ? `, back to ledger ${reached.toLocaleString("en-US")}` : ""}. Older keeps looking further back.`
                  : `No ${kind} in this account's history.`
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wider text-dim">
                    Action
                  </th>
                  <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wider text-dim">
                    Details
                  </th>
                  <th className="pb-2 text-right text-xs font-medium uppercase tracking-wider text-dim">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((op) => {
                  const failed =
                    (op as unknown as { transaction_successful?: boolean })
                      .transaction_successful === false;
                  const badge = opBadge(op.type as string);
                  return (
                    <ClickableRow
                      key={op.id}
                      href={`/tx/${op.transaction_hash}`}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="py-2.5 pr-4 align-top whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {failed && (
                            <XCircle
                              className="size-3.5 text-fail"
                              aria-label="Transaction failed"
                            />
                          )}
                          <Badge
                            variant="outline"
                            className="font-mono text-[11px] text-dim"
                          >
                            {badge.label}
                          </Badge>
                        </span>
                      </td>
                      <td className="min-w-0 py-2.5 pr-4 align-top">
                        <OpSentence
                          segments={humanizeOperationFor(op, selfAddress)}
                        />
                      </td>
                      <td className="py-2.5 text-right align-top whitespace-nowrap">
                        <Link
                          href={`/tx/${op.transaction_hash}`}
                          className="rounded-sm"
                          aria-label="View transaction"
                        >
                          <TimeExact
                            iso={op.created_at}
                            className="hover:text-foreground"
                          />
                        </Link>
                      </td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-xs text-dim">
          <span className="mr-1">Per page</span>
          {[10, 25, 50].map((n) => (
            <Link
              key={n}
              prefetch={false}
              href={href({
                limit: n === 10 ? undefined : String(n),
                cursor: undefined,
                dir: undefined,
              })}
              className={cn(
                "rounded-md px-2 py-1 font-mono transition-colors duration-150",
                waiting,
                n === limit
                  ? "bg-surface-2 text-foreground"
                  : "hover:text-foreground",
              )}
              aria-current={n === limit ? "true" : undefined}
            >
              {n}
              <LinkPending />
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {page.hasNewer && page.prevCursor ? (
            <Link
              href={href({ cursor: page.prevCursor, dir: "newer" })}
              prefetch={false}
              className={cn(
                "rounded-md border border-border px-3 py-1.5 text-sm text-dim transition-colors duration-150 hover:text-foreground",
                waiting,
              )}
            >
              ← Newer
              <LinkPending />
            </Link>
          ) : (
            <span className="rounded-md border border-border px-3 py-1.5 text-sm text-dim/40 select-none">
              ← Newer
            </span>
          )}
          {page.hasOlder && page.nextCursor ? (
            <Link
              href={href({ cursor: page.nextCursor, dir: undefined })}
              prefetch={false}
              className={cn(
                "rounded-md border border-border px-3 py-1.5 text-sm text-dim transition-colors duration-150 hover:text-foreground",
                waiting,
              )}
            >
              Older →
              <LinkPending />
            </Link>
          ) : (
            <span className="rounded-md border border-border px-3 py-1.5 text-sm text-dim/40 select-none">
              Older →
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
