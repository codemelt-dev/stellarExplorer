"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getClientNetwork } from "@/lib/stellar/clientConfig";
import { CONTRACT_TYPES, PAYMENT_TYPES, TRADE_TYPES } from "@/lib/stellar/opFilters";
import { cn } from "@/lib/utils";

interface OpLite {
  type: string;
  created_at: string;
}

const CATEGORIES = [
  { id: "contracts", label: "Contract calls", color: "var(--contract)" },
  { id: "payments", label: "Payments", color: "var(--gold)" },
  { id: "trades", label: "DEX & pools", color: "var(--ok)" },
  { id: "config", label: "Account & config", color: "var(--text-dim)" },
] as const;

function categorize(type: string): (typeof CATEGORIES)[number]["id"] {
  if (CONTRACT_TYPES.has(type)) return "contracts";
  if (PAYMENT_TYPES.has(type)) return "payments";
  if (TRADE_TYPES.has(type)) return "trades";
  return "config";
}

// personal activity mix, shown only when the connected wallet IS this account.
// Built from the most recent operations Horizon returns, no indexer
export function MyActivity({ accountId }: { accountId: string }) {
  const [mine, setMine] = useState(false);
  const [ops, setOps] = useState<OpLite[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [window30d, setWindow30d] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("wallet_address") !== accountId) return;
    setMine(true);
    const { horizonUrl } = getClientNetwork();
    fetch(`${horizonUrl}/accounts/${accountId}/operations?order=desc&limit=200&include_failed=true`)
      .then((res) => res.json())
      .then((json) => {
        const records = (json?._embedded?.records ?? []) as OpLite[];
        setOps(records);
      })
      .catch(() => setFailed(true));
  }, [accountId]);

  const { counts, total, oldest } = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    const scoped = (ops ?? []).filter(
      (op) => !window30d || new Date(op.created_at).getTime() >= cutoff,
    );
    const counts: Record<string, number> = {};
    for (const op of scoped) {
      const cat = categorize(op.type);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return {
      counts,
      total: scoped.length,
      oldest: ops?.length ? ops[ops.length - 1].created_at : null,
    };
  }, [ops, window30d]);

  if (!mine) return null;

  const segments = CATEGORIES.map((c) => ({
    ...c,
    count: counts[c.id] ?? 0,
  })).filter((s) => s.count > 0);

  // donut geometry: one circle per segment, offset along the circumference
  const R = 44;
  const C = 2 * Math.PI * R;
  let acc = 0;

  return (
    <Card className="tile gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">Your activity</h2>
          <span className="text-xs text-dim">only visible to you</span>
        </div>
        <nav className="flex gap-1" aria-label="Activity window">
          {[
            { id: false, label: ops && ops.length === 200 ? "Last 200 ops" : "All" },
            { id: true, label: "30 days" },
          ].map((w) => (
            <button
              key={String(w.id)}
              type="button"
              onClick={() => setWindow30d(w.id)}
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors duration-150",
                w.id === window30d
                  ? "bg-surface-2 text-foreground"
                  : "text-dim hover:text-foreground",
              )}
              aria-pressed={w.id === window30d}
            >
              {w.label}
            </button>
          ))}
        </nav>
      </div>

      {failed ? (
        <p className="py-6 text-center text-sm text-dim">
          Horizon didn&apos;t respond. Refresh to retry.
        </p>
      ) : !ops ? (
        <div className="flex items-center gap-6">
          <Skeleton className="size-32 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ) : total === 0 ? (
        <p className="py-6 text-center text-sm text-dim">
          Nothing in this window yet.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="relative">
            <svg width="128" height="128" viewBox="0 0 128 128" role="img"
              aria-label={`Activity breakdown across ${total} operations`}>
              {segments.map((s) => {
                const frac = s.count / total;
                const dash = frac * C;
                const offset = acc * C;
                acc += frac;
                return (
                  <circle
                    key={s.id}
                    cx="64"
                    cy="64"
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="13"
                    strokeDasharray={`${Math.max(dash - 2, 0.5)} ${C}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 64 64)"
                    strokeLinecap="butt"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-xl font-semibold">{total}</span>
              <span className="text-[10px] uppercase tracking-wider text-dim">
                ops
              </span>
            </div>
          </div>

          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            {segments
              .sort((a, b) => b.count - a.count)
              .map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.label}
                  </span>
                  <span className="font-mono text-sm">
                    {s.count}
                    <span className="text-dim">
                      {" "}
                      {((s.count / total) * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
              ))}
            {oldest && (
              <p className="mt-1 text-[11px] text-dim">
                Based on your {ops.length === 200 ? "latest 200" : `${ops.length}`}{" "}
                operations, back to {new Date(oldest).toISOString().slice(0, 10)}.
                Full lifetime analytics need an indexer, on the roadmap.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
