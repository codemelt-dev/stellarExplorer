import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OpSentence } from "@/components/stellar/OpSentence";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { TimeExact } from "@/components/stellar/Time";
import { EmptyState } from "@/components/states/EmptyState";
import { humanizeOperationFor, opBadge } from "@/lib/stellar/humanize";
import type { HistoryFilter, OperationsPage } from "@/lib/stellar/accounts";
import { cn } from "@/lib/utils";
import { XCircle } from "lucide-react";

const FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "payments", label: "Payments" },
  { id: "trades", label: "Trades" },
  { id: "contracts", label: "Contract calls" },
];

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
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">History</h2>
        <nav className="flex gap-1" aria-label="History filter">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={href({ filter: f.id === "all" ? undefined : f.id, cursor: undefined, dir: undefined })}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors duration-150",
                f.id === filter
                  ? "bg-surface-2 text-foreground"
                  : "text-dim hover:text-foreground",
              )}
              aria-current={f.id === filter ? "page" : undefined}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message={
            filter === "all"
              ? "No operations yet. This account hasn't transacted."
              : page.hasOlder
                ? `No ${filter === "contracts" ? "contract calls" : filter} in this range. Older may find some further back.`
                : `No ${filter === "contracts" ? "contract calls" : filter} in this account's history.`
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-xs text-dim">
          <span className="mr-1">Per page</span>
          {[10, 25, 50].map((n) => (
            <Link
              key={n}
              href={href({
                limit: n === 10 ? undefined : String(n),
                cursor: undefined,
                dir: undefined,
              })}
              className={cn(
                "rounded-md px-2 py-1 font-mono transition-colors duration-150",
                n === limit
                  ? "bg-surface-2 text-foreground"
                  : "hover:text-foreground",
              )}
              aria-current={n === limit ? "true" : undefined}
            >
              {n}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {page.hasNewer && page.prevCursor ? (
            <Link
              href={href({ cursor: page.prevCursor, dir: "newer" })}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-dim transition-colors duration-150 hover:text-foreground"
            >
              ← Newer
            </Link>
          ) : (
            <span className="rounded-md border border-border px-3 py-1.5 text-sm text-dim/40 select-none">
              ← Newer
            </span>
          )}
          {page.hasOlder && page.nextCursor ? (
            <Link
              href={href({ cursor: page.nextCursor, dir: undefined })}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-dim transition-colors duration-150 hover:text-foreground"
            >
              Older →
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
