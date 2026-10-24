"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states/ErrorState";
import { TxRawCard } from "./TxRawCard";
import type { TxRaw } from "@/lib/stellar/transactions";

// XDR tab of a transaction served by the indexer, which keeps no XDR. The tab
// only mounts when opened, so Horizon is asked then and not on every view
export function RawXdr({ hash }: { hash: string }) {
  const [raw, setRaw] = useState<TxRaw | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/tx/${hash}/raw`)
      .then((res) => {
        if (!res.ok) throw new Error(`raw ${res.status}`);
        return res.json() as Promise<TxRaw>;
      })
      .then((data) => live && setRaw(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [hash, attempt]);

  if (raw) return <TxRawCard raw={raw} />;
  if (failed) {
    return (
      <Card className="p-0">
        <ErrorState
          message="Couldn't load the raw XDR from Horizon."
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      </Card>
    );
  }
  return (
    <Card className="gap-3 p-5" aria-busy="true" aria-label="Loading raw XDR">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-3 w-64" />
      <Skeleton className="h-3 w-24" />
    </Card>
  );
}
