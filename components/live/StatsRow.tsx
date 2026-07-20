"use client";

import { useLedgerStream } from "./LedgerStreamProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { Activity, Gauge, Layers, Timer, type LucideIcon } from "lucide-react";

/** Headline stats derived from the streamed ledger window. */
export function StatsRow() {
  const { ledgers, latest, avgCloseMs } = useLedgerStream();

  if (!latest) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const txTotal = latest.txOk + latest.txFailed;
  const tps = avgCloseMs > 0 ? (txTotal / (avgCloseMs / 1000)).toFixed(1) : "–";
  const windowOps = ledgers.reduce((sum, l) => sum + l.opCount, 0);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat
        label="Avg close time"
        value={`${(avgCloseMs / 1000).toFixed(1)}s`}
        icon={Timer}
      />
      <Stat label="TPS (last ledger)" value={tps} icon={Gauge} />
      <Stat
        label="Txs in last ledger"
        value={
          <>
            {txTotal}
            {latest.txFailed > 0 && (
              <span className="text-base text-fail"> ({latest.txFailed}✗)</span>
            )}
          </>
        }
        icon={Activity}
      />
      <Stat
        label={`Ops, last ${ledgers.length} ledgers`}
        value={windowOps.toLocaleString("en-US")}
        secondary={`base fee ${stroopsToLumens(latest.baseFeeStroops)} XLM`}
        icon={Layers}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  secondary,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  secondary?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="tile relative flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <Icon
        className="absolute top-4 right-4 size-4 text-dim/60"
        aria-hidden="true"
      />
      <span className="text-xs uppercase tracking-wider text-dim">{label}</span>
      <span className="font-mono text-2xl font-semibold sm:text-3xl">
        {value}
      </span>
      {secondary && (
        <span className="font-mono text-xs text-dim">{secondary}</span>
      )}
    </div>
  );
}
