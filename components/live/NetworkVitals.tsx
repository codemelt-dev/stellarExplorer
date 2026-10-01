"use client";

import { useLedgerStream } from "./LedgerStreamProvider";
import { HeaderPulse } from "./LedgerPulse";
import { stroopsToLumens } from "@/lib/stellar/amount";

// live base fee + current ledger for the top bar, straight off the ledger stream
export function NetworkVitals() {
  const { latest, avgCloseMs } = useLedgerStream();
  if (!latest) return null;
  return (
    <>
      <span className="hidden shrink-0 items-center gap-1.5 tabular-nums sm:inline-flex">
        <span className="text-dim">Base fee</span>
        <span className="font-medium">{stroopsToLumens(latest.baseFeeStroops)} XLM</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 tabular-nums md:inline-flex">
        <span className="text-dim">Close time</span>
        <span className="font-medium">{(avgCloseMs / 1000).toFixed(1)}s</span>
      </span>
      <HeaderPulse />
    </>
  );
}
