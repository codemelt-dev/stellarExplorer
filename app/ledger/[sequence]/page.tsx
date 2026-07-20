import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Address } from "@/components/stellar/Address";
import { Time } from "@/components/stellar/Time";
import { Amount } from "@/components/stellar/Amount";
import { CopyButton } from "@/components/stellar/CopyButton";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { getLedger, getLedgerTransactions } from "@/lib/stellar/ledgers";
import { NotFoundError } from "@/lib/stellar/transactions";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { truncateKey } from "@/lib/stellar/strkey";
import { activeNetwork } from "@/lib/stellar/network";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sequence: string }>;
}): Promise<Metadata> {
  const { sequence } = await params;
  return { title: `Ledger ${sequence} · Stellar Explorer` };
}

export default async function LedgerPage({
  params,
}: {
  params: Promise<{ sequence: string }>;
}) {
  const { sequence } = await params;
  const seq = Number(sequence);
  const netLabel = (await activeNetwork()).label.toLowerCase();
  if (!Number.isSafeInteger(seq) || seq <= 0) {
    return (
      <EmptyState
        icon={SearchX}
        message={`"${sequence}" isn't a valid ledger sequence.`}
        className="py-24"
      />
    );
  }

  let ledger;
  let txs;
  try {
    [ledger, txs] = await Promise.all([
      getLedger(seq),
      getLedgerTransactions(seq),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <EmptyState
          icon={SearchX}
          message={`Ledger ${seq} doesn't exist on ${netLabel} yet. The network may not have reached it yet.`}
          className="py-24"
        />
      );
    }
    return (
      <ErrorState
        message="Horizon didn't respond while loading this ledger."
        className="py-24"
      />
    );
  }

  const record = ledger as typeof ledger & {
    successful_transaction_count?: number;
    failed_transaction_count?: number;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Ledger <span className="font-mono">{ledger.sequence}</span>
        </h1>
        <nav className="flex gap-1 font-mono text-sm" aria-label="Adjacent ledgers">
          <Link
            href={`/ledger/${seq - 1}`}
            className="rounded px-1.5 text-dim hover:text-foreground"
          >
            ← {seq - 1}
          </Link>
          <Link
            href={`/ledger/${seq + 1}`}
            className="rounded px-1.5 text-dim hover:text-foreground"
          >
            {seq + 1} →
          </Link>
        </nav>
      </div>

      <Card className="flex-row flex-wrap gap-x-10 gap-y-4 p-5">
        <Meta label="Closed">
          <Time iso={ledger.closed_at} className="text-foreground" />
        </Meta>
        <Meta label="Transactions">
          <span className="font-mono text-sm">
            <span className="text-ok">{record.successful_transaction_count ?? "–"} ok</span>
            {" · "}
            <span className={record.failed_transaction_count ? "text-fail" : "text-dim"}>
              {record.failed_transaction_count ?? 0} failed
            </span>
          </span>
        </Meta>
        <Meta label="Operations">
          <span className="font-mono text-sm">{ledger.operation_count}</span>
        </Meta>
        <Meta label="Base fee">
          <Amount amount={stroopsToLumens(ledger.base_fee_in_stroops)} />
        </Meta>
        <Meta label="Protocol">
          <span className="font-mono text-sm">v{ledger.protocol_version}</span>
        </Meta>
        <Meta label="Hash">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono text-sm text-dim" title={ledger.hash}>
              {truncateKey(ledger.hash, 6)}
            </span>
            <CopyButton value={ledger.hash} label="Copy ledger hash" />
          </span>
        </Meta>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {txs.length} transaction{txs.length === 1 ? "" : "s"}
        </h2>
        {txs.length === 0 ? (
          <Card className="p-0">
            <EmptyState message="No transactions in this ledger. It closed empty." />
          </Card>
        ) : (
          <Card className="gap-0 p-5 py-2">
            {txs.map((tx) => (
              <div
                key={tx.hash}
                className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {tx.successful ? (
                    <CheckCircle2 className="size-4 shrink-0 text-ok/60" aria-label="Success" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-fail" aria-label="Failed" />
                  )}
                  <Link
                    href={`/tx/${tx.hash}`}
                    className="rounded-sm font-mono text-sm text-gold hover:underline underline-offset-4"
                    title={tx.hash}
                  >
                    {truncateKey(tx.hash, 6)}
                  </Link>
                  <span className="hidden text-sm text-dim sm:inline">
                    {tx.operation_count} op{tx.operation_count === 1 ? "" : "s"}
                  </span>
                  <span className="hidden md:inline">
                    <Address address={tx.source_account} />
                  </span>
                </div>
                <Amount
                  amount={stroopsToLumens(tx.fee_charged)}
                  className="text-dim"
                />
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-dim">{label}</span>
      {children}
    </div>
  );
}
