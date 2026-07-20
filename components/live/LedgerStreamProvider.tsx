"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getClientNetwork } from "@/lib/stellar/clientConfig";

export interface LedgerLite {
  sequence: number;
  closedAt: string;
  txOk: number;
  txFailed: number;
  opCount: number;
  baseFeeStroops: number;
  protocol: number;
}

export type StreamStatus = "connecting" | "live" | "error";

interface LedgerStreamValue {
  /** Newest first; seeded with recent history, then fed by SSE. */
  ledgers: LedgerLite[];
  latest: LedgerLite | null;
  /** Average close time in ms over the tracked window (fallback 5500). */
  avgCloseMs: number;
  status: StreamStatus;
}

const LedgerStreamContext = createContext<LedgerStreamValue>({
  ledgers: [],
  latest: null,
  avgCloseMs: 5500,
  status: "connecting",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLite(record: any): LedgerLite {
  return {
    sequence: record.sequence,
    closedAt: record.closed_at,
    txOk: record.successful_transaction_count ?? 0,
    txFailed: record.failed_transaction_count ?? 0,
    opCount: record.operation_count ?? 0,
    baseFeeStroops: record.base_fee_in_stroops ?? 100,
    protocol: record.protocol_version ?? 0,
  };
}

const WINDOW = 60;

export function LedgerStreamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ledgers, setLedgers] = useState<LedgerLite[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");

  useEffect(() => {
    let cancelled = false;
    const { horizonUrl } = getClientNetwork();

    // Seed with recent history for instant stats, then stream.
    fetch(`${horizonUrl}/ledgers?order=desc&limit=${WINDOW}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const records = (json?._embedded?.records ?? []).map(toLite);
        setLedgers((prev) => mergeLedgers(prev, records));
        setStatus("live");
      })
      .catch(() => {
        if (!cancelled) setStatus((s) => (s === "live" ? s : "error"));
      });

    const source = new EventSource(`${horizonUrl}/ledgers?cursor=now`);
    source.onmessage = (event) => {
      try {
        const record = toLite(JSON.parse(event.data));
        setLedgers((prev) => mergeLedgers(prev, [record]));
        setStatus("live");
      } catch {
        // keepalive/hello frames - ignore
      }
    };
    source.onerror = () => {
      // EventSource auto-reconnects; only degrade status if we never connected.
      setStatus((s) => (s === "live" ? s : "error"));
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  const value = useMemo<LedgerStreamValue>(() => {
    const latest = ledgers[0] ?? null;
    let avgCloseMs = 5500;
    if (ledgers.length >= 2) {
      const diffs: number[] = [];
      for (let i = 0; i < ledgers.length - 1; i++) {
        const diff =
          new Date(ledgers[i].closedAt).getTime() -
          new Date(ledgers[i + 1].closedAt).getTime();
        if (diff > 0 && diff < 30_000) diffs.push(diff);
      }
      if (diffs.length) {
        avgCloseMs = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      }
    }
    return { ledgers, latest, avgCloseMs, status };
  }, [ledgers, status]);

  return (
    <LedgerStreamContext.Provider value={value}>
      {children}
    </LedgerStreamContext.Provider>
  );
}

function mergeLedgers(prev: LedgerLite[], incoming: LedgerLite[]): LedgerLite[] {
  const bySeq = new Map<number, LedgerLite>();
  for (const l of [...incoming, ...prev]) bySeq.set(l.sequence, l);
  return [...bySeq.values()]
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, WINDOW);
}

export function useLedgerStream(): LedgerStreamValue {
  return useContext(LedgerStreamContext);
}
