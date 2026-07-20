"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OpSentence } from "@/components/stellar/OpSentence";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { Time } from "@/components/stellar/Time";
import { humanizeOperation, opBadge } from "@/lib/stellar/humanize";
import { matchesFilter, type HistoryFilter } from "@/lib/stellar/opFilters";
import type { OperationRecord } from "@/lib/stellar/transactions";
import { getClientNetwork } from "@/lib/stellar/clientConfig";
import { cn } from "@/lib/utils";
import { XCircle } from "lucide-react";

const MAX_ROWS = 60; // keep a deeper buffer so filters have material
const VISIBLE_ROWS = 14;

const FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "payments", label: "Payments" },
  { id: "trades", label: "Trades" },
  { id: "contracts", label: "Contracts" },
];

// streaming ops table. Hover pauses the feed, incoming ops buffer and flush on leave
export function LiveOpsFeed() {
  const [ops, setOps] = useState<OperationRecord[]>([]);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const pausedRef = useRef(false);
  const bufferRef = useRef<OperationRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    const { horizonUrl } = getClientNetwork();

    const push = (records: OperationRecord[]) => {
      setOps((prev) => {
        const seen = new Set(prev.map((op) => op.id));
        const fresh = records.filter((op) => !seen.has(op.id));
        return [...fresh, ...prev].slice(0, MAX_ROWS);
      });
    };

    fetch(`${horizonUrl}/operations?order=desc&limit=${MAX_ROWS}&include_failed=true`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        push(json?._embedded?.records ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    // ops arrive in bursts when a ledger closes. Buffer everything and flush
    // once per interval so the list reflows once, not ten times in a row
    const source = new EventSource(
      `${horizonUrl}/operations?cursor=now&include_failed=true`,
    );
    source.onmessage = (event) => {
      try {
        const record = JSON.parse(event.data) as OperationRecord;
        bufferRef.current = [record, ...bufferRef.current].slice(0, MAX_ROWS);
      } catch {
        // keepalive frames
      }
    };

    const flusher = setInterval(() => {
      if (pausedRef.current || bufferRef.current.length === 0) return;
      const buffered = bufferRef.current;
      bufferRef.current = [];
      push(buffered);
    }, 900);

    return () => {
      cancelled = true;
      source.close();
      clearInterval(flusher);
    };
  }, []);

  function pause() {
    pausedRef.current = true;
    setPaused(true);
  }
  function resume() {
    pausedRef.current = false;
    setPaused(false);
  }

  const visible = ops
    .filter((op) => matchesFilter(op.type as string, filter))
    .slice(0, VISIBLE_ROWS);

  return (
    <Card className="tile gap-3 p-5" onMouseEnter={pause} onMouseLeave={resume}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Live operations</h2>
        <div className="flex items-center gap-3">
          <nav className="flex gap-1" aria-label="Live feed filter">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors duration-150",
                  f.id === filter
                    ? "bg-surface-2 text-foreground"
                    : "text-dim hover:text-foreground",
                )}
                aria-pressed={f.id === filter}
              >
                {f.label}
              </button>
            ))}
          </nav>
          <span
            className={cn(
              "text-xs uppercase tracking-wider transition-colors duration-150",
              paused ? "text-gold" : "text-dim",
            )}
          >
            {paused ? "paused" : "live"}
          </span>
        </div>
      </div>

      {failed ? (
        <p className="py-8 text-center text-sm text-dim">
          Horizon didn&apos;t respond. Refresh to retry.
        </p>
      ) : ops.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-dim">
          Nothing matching this filter in the last {ops.length} operations.
          They&apos;ll appear here as they stream in.
        </p>
      ) : (
        <div>
          <div className="grid grid-cols-[7rem_minmax(0,1fr)_auto] gap-x-4 border-b border-border pb-2 text-xs font-medium uppercase tracking-wider text-dim">
            <span>Type</span>
            <span>Details</span>
            <span className="text-right">Age</span>
          </div>
          {/* fixed viewport: the card never changes height while rows churn */}
          <div className="h-[588px] overflow-hidden">
          {visible.map((op) => {
            const opFailed =
              (op as unknown as { transaction_successful?: boolean })
                .transaction_successful === false;
            const badge = opBadge(op.type as string);
            return (
              // outer single-row grid animates 0fr -> 1fr, so the row
              // unfolds to its height instead of popping in
              <ClickableRow
                as="div"
                key={op.id}
                href={`/tx/${op.transaction_hash}`}
                className="animate-row-in grid [grid-template-rows:1fr] border-b border-border last:border-b-0"
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="grid h-[41px] grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-x-4">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {opFailed && (
                        <XCircle
                          className="size-3.5 shrink-0 text-fail"
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
                    <div className="truncate">
                      <OpSentence segments={humanizeOperation(op)} />
                    </div>
                    <Link
                      href={`/tx/${op.transaction_hash}`}
                      className="rounded-sm text-right whitespace-nowrap"
                      aria-label="View transaction"
                    >
                      <Time
                        iso={op.created_at}
                        className="hover:text-foreground"
                      />
                    </Link>
                  </div>
                </div>
              </ClickableRow>
            );
          })}
          </div>
        </div>
      )}
    </Card>
  );
}
