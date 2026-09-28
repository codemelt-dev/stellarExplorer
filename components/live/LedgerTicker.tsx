"use client";

import Link from "next/link";
import { useState } from "react";
import { useLedgerStream, type LedgerLite } from "./LedgerStreamProvider";
import { LIST_REFRESH_LEDGERS } from "./cadence";
import { Time } from "@/components/stellar/Time";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Recent ledgers; a new card slides in as each ledger closes. */
export function LedgerTicker() {
  const { ledgers: live } = useLedgerStream();
  // snapshot that only advances every few ledgers, so rows stay put.
  // Adjusting state during render, React's pattern for derived state
  const [ledgers, setLedgers] = useState<LedgerLite[]>(live);
  const newest = live[0]?.sequence ?? 0;
  const shown = ledgers[0]?.sequence ?? 0;
  if (
    (ledgers.length === 0 && live.length > 0) ||
    newest - shown >= LIST_REFRESH_LEDGERS
  ) {
    setLedgers(live);
  }

  return (
    <Card className="tile gap-3 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Ledgers</h2>
        <Link
          href="/ledgers"
          className="rounded-sm text-xs text-dim transition-colors duration-150 hover:text-foreground"
        >
          View all
        </Link>
      </div>
      {ledgers.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <div className="h-[588px] overflow-hidden">
          {(() => {
            const rows = ledgers.slice(0, 14);
            const peak = Math.max(...rows.map((l) => l.txOk + l.txFailed), 1);
            return rows.map((ledger) => {
              const total = ledger.txOk + ledger.txFailed;
              return (
                <div
                  key={ledger.sequence}
                  className="animate-row-in grid [grid-template-rows:1fr] border-b border-border last:border-b-0"
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="flex h-[41px] items-center gap-3">
                      <Link
                        href={`/ledger/${ledger.sequence}`}
                        className="shrink-0 rounded-sm text-sm font-medium tabular-nums transition-colors duration-150 hover:text-gold"
                      >
                        {ledger.sequence.toLocaleString("en-US")}
                      </Link>
                      {/* activity bar: tx count vs the visible peak */}
                      <span
                        className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2"
                        title={`${total} tx, busiest ledger in view has ${peak}`}
                      >
                        <span
                          className="block h-full rounded-full bg-dim/50 transition-[width] duration-300"
                          style={{ width: `${Math.max(8, (total / peak) * 100)}%` }}
                        />
                      </span>
                      <span className="ml-auto text-xs text-dim tabular-nums whitespace-nowrap">
                        {total} tx
                        {ledger.txFailed > 0 && (
                          <span className="text-fail"> · {ledger.txFailed}✗</span>
                        )}
                        {" · "}
                        {ledger.opCount} ops
                      </span>
                      <Time iso={ledger.closedAt} className="shrink-0" />
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </Card>
  );
}
