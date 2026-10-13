"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  /** XLM collected in fees, burned into the pool. */
  feePool: number;
}

export type StreamStatus = "connecting" | "live" | "error";

/** When the ledger on display appeared and when the next one is due (epoch ms). */
export interface LedgerTick {
  startedAt: number;
  endsAt: number;
}

interface LedgerStreamValue {
  /** Newest first; seeded with recent history, then fed by SSE. */
  ledgers: LedgerLite[];
  latest: LedgerLite | null;
  /** Average close time in ms over the tracked window (fallback 5500). */
  avgCloseMs: number;
  status: StreamStatus;
  tick: LedgerTick | null;
}

const LedgerStreamContext = createContext<LedgerStreamValue>({
  ledgers: [],
  latest: null,
  avgCloseMs: 5500,
  status: "connecting",
  tick: null,
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
    feePool: Number(record.fee_pool ?? 0),
  };
}

const WINDOW = 60;

// Horizon hands ledgers over 3 to 6 seconds after they close, at uneven gaps
// (its stream also restarts every ~10s). Showing each one on arrival makes the
// counter stall and then jump, so ledgers go on display on a steady clock
// instead: close time + the slowest recent delivery.
const LAG_SAMPLES = 12;
const LAG_MARGIN_MS = 250;
// never hold a ledger longer than this past the fastest delivery seen
const MAX_HOLD_MS = 5000;
// further behind than this (tab was asleep): skip ahead instead of replaying
const MAX_PENDING = 3;

function displayDelayMs(lags: number[]): number {
  if (lags.length === 0) return 0;
  const slowest = Math.max(...lags);
  const fastest = Math.min(...lags);
  return Math.min(slowest, fastest + MAX_HOLD_MS) + LAG_MARGIN_MS;
}

function averageCloseMs(ledgers: LedgerLite[]): number {
  const diffs: number[] = [];
  for (let i = 0; i < ledgers.length - 1; i++) {
    const diff =
      new Date(ledgers[i].closedAt).getTime() -
      new Date(ledgers[i + 1].closedAt).getTime();
    if (diff > 0 && diff < 30_000) diffs.push(diff);
  }
  return diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 5500;
}

export function LedgerStreamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // everything received so far, newest first
  const [known, setLedgers] = useState<LedgerLite[]>([]);
  // highest sequence on display; newer known ledgers wait for their turn
  const [shownSeq, setShownSeq] = useState(0);
  const [tick, setTick] = useState<LedgerTick | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  // delivery lag (arrival - close time) of the last few streamed ledgers.
  // A skewed device clock shifts lag and due time alike, so it cancels out
  const lags = useRef<number[]>([]);

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
        lags.current = [
          ...lags.current.slice(1 - LAG_SAMPLES),
          Date.now() - new Date(record.closedAt).getTime(),
        ];
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

  // put the next waiting ledger on display when its time comes
  useEffect(() => {
    const pending = known.filter((l) => l.sequence > shownSeq);
    if (pending.length === 0) return;
    // first paint, or too far behind to step through: go straight to the newest
    const jump = shownSeq === 0 || pending.length > MAX_PENDING;
    const next = jump ? pending[0] : pending[pending.length - 1];
    const closedAt = new Date(next.closedAt).getTime();
    const dueIn = jump ? 0 : closedAt + displayDelayMs(lags.current) - Date.now();

    const id = setTimeout(() => {
      // the one after it closes a known interval later, else assume the average
      const after = known.find((l) => l.sequence === next.sequence + 1);
      const interval = after
        ? new Date(after.closedAt).getTime() - closedAt
        : averageCloseMs(known);
      const startedAt = Date.now();
      setShownSeq(next.sequence);
      setTick({ startedAt, endsAt: startedAt + Math.min(Math.max(interval, 2000), 10_000) });
    }, Math.max(dueIn, 0));
    return () => clearTimeout(id);
  }, [known, shownSeq]);

  const value = useMemo<LedgerStreamValue>(() => {
    const ledgers = known.filter((l) => l.sequence <= shownSeq);
    return {
      ledgers,
      latest: ledgers[0] ?? null,
      avgCloseMs: averageCloseMs(known),
      status,
      tick,
    };
  }, [known, shownSeq, status, tick]);

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
