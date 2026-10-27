"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Address } from "@/components/stellar/Address";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { FederationError, resolveFederation, type FederationRecord } from "@/lib/stellar/federation";

type Lookup =
  | { state: "loading" }
  | { state: "found"; record: FederationRecord }
  | { state: "failed"; error: FederationError };

// Resolves name*domain and opens the account. A memo means the account is
// shared, so it stays on screen with the memo instead of jumping
export function FederationLookup({ address }: { address: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<Lookup>({ state: "loading" });

  useEffect(() => {
    let live = true;
    resolveFederation(address).then(
      (record) => {
        if (!live) return;
        if (record.memo) setLookup({ state: "found", record });
        else router.replace(`/account/${record.accountId}`);
      },
      (error: unknown) => {
        if (!live) return;
        setLookup({
          state: "failed",
          error:
            error instanceof FederationError
              ? error
              : new FederationError(`Couldn't resolve ${address}.`, true),
        });
      },
    );
    return () => {
      live = false;
    };
  }, [address, attempt, router]);

  if (lookup.state === "loading") {
    return (
      <Card className="gap-3 p-5" aria-busy="true">
        <p className="text-sm text-dim">
          Looking up <span className="font-mono text-foreground">{address}</span>…
        </p>
        <Skeleton className="h-5 w-72 max-w-full" />
      </Card>
    );
  }

  if (lookup.state === "failed") {
    return lookup.error.retry ? (
      <ErrorState
        message={lookup.error.message}
        onRetry={() => {
          setLookup({ state: "loading" });
          setAttempt((n) => n + 1);
        }}
        className="py-16"
      />
    ) : (
      <EmptyState
        icon={SearchX}
        message={`${lookup.error.message} Paste the account address directly instead.`}
        className="py-16"
      />
    );
  }

  const { record } = lookup;
  return (
    <Card className="gap-3 p-5">
      <p className="text-sm text-dim">
        <span className="font-mono text-foreground">{address}</span> belongs to
      </p>
      <Address address={record.accountId} chars={8} />
      <p className="text-sm text-dim">
        Payments to it need memo{record.memoType ? ` (${record.memoType})` : ""}{" "}
        <span className="font-mono text-foreground break-all">{record.memo}</span>
      </p>
      <Link
        href={`/account/${record.accountId}`}
        className="self-start rounded-sm text-sm text-gold underline-offset-4 hover:underline"
      >
        Open account
      </Link>
    </Card>
  );
}
