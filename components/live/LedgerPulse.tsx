"use client";

import { useEffect, useState } from "react";
import { useLedgerStream } from "./LedgerStreamProvider";
import { RollingNumber } from "./RollingNumber";
import { Skeleton } from "@/components/ui/skeleton";

// the ledger pulse. Bar fills over the avg close time, offset by how far into
// the current ledger we already are; a new ledger resets it via key={sequence}
export function LedgerPulse() {
  const { latest, avgCloseMs, status } = useLedgerStream();
  // Client-only value; rendered after mount so SSR markup stays stable.
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    if (!latest) return;
    setElapsedMs(Date.now() - new Date(latest.closedAt).getTime());
  }, [latest]);

  if (!latest || elapsedMs === null) {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-3">
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-1 w-full" />
        <span className="text-xs uppercase tracking-wider text-dim">
          {status === "error" ? "Horizon stream unavailable" : "Connecting to Horizon…"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3">
      <div
        className="font-mono text-4xl font-semibold tracking-tight sm:text-5xl"
        aria-live="polite"
        aria-label={`Current ledger ${latest.sequence}`}
      >
        <span className="text-dim">#</span>
        <RollingNumber value={latest.sequence} />
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
        role="presentation"
      >
        <div
          key={latest.sequence}
          className="glow-gold h-full w-full origin-left rounded-full bg-gold"
          style={{
            animation: `ledger-fill ${Math.round(avgCloseMs)}ms linear ${-Math.min(elapsedMs, avgCloseMs)}ms forwards`,
          }}
        />
      </div>
      <span className="text-xs uppercase tracking-wider text-dim">
        ledger closes every ~{(avgCloseMs / 1000).toFixed(1)}s
      </span>
    </div>
  );
}

/** Compact pulse for the header - persistent across all pages. */
export function HeaderPulse() {
  const { latest } = useLedgerStream();
  if (!latest) return null;
  return (
    <span
      className="hidden items-center gap-2 font-mono text-xs text-dim sm:inline-flex"
      aria-label={`Current ledger ${latest.sequence}`}
    >
      <span
        key={latest.sequence}
        className="size-1.5 animate-ledger-tick rounded-full bg-gold"
      />
      {latest.sequence.toLocaleString("en-US")}
    </span>
  );
}
