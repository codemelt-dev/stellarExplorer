"use client";

import Link from "next/link";
import { useLedgerStream } from "./LedgerStreamProvider";
import { Time } from "@/components/stellar/Time";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Recent ledgers; a new card slides in as each ledger closes. */
export function LedgerTicker() {
  const { ledgers } = useLedgerStream();

  return (
    <Card className="tile gap-3 p-5">
      <h2 className="text-base font-semibold">Ledgers</h2>
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
                        className="shrink-0 rounded-sm font-mono text-sm transition-colors duration-150 hover:text-gold"
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
                      <span className="ml-auto font-mono text-xs text-dim whitespace-nowrap">
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
