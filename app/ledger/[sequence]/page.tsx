import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, CheckCircle2, ChevronLeft, ChevronRight, XCircle } from "lucide-react";
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className="text-sm text-dim">
            <Link href="/ledgers" className="rounded-sm hover:text-foreground">
              Ledgers
            </Link>
            <span aria-hidden="true"> / </span>
            <span className="text-foreground tabular-nums">{seq.toLocaleString("en-US")}</span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ledger <span className="tabular-nums">{seq.toLocaleString("en-US")}</span>
          </h1>
        </div>
        <nav className="flex w-full gap-2 sm:w-auto" aria-label="Adjacent ledgers">
          <LedgerStep href={`/ledger/${seq - 1}`} direction="prev" sequence={seq - 1} />
          <LedgerStep href={`/ledger/${seq + 1}`} direction="next" sequence={seq + 1} />
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

// prev/next as real buttons: direction label on top, target sequence under it
function LedgerStep({
  href,
  direction,
  sequence,
}: {
  href: string;
  direction: "prev" | "next";
  sequence: number;
}) {
  const next = direction === "next";
  const Icon = next ? ChevronRight : ChevronLeft;
  return (
    <Link
      href={href}
      aria-label={`${next ? "Next" : "Previous"} ledger, ${sequence}`}
      className={`group flex flex-1 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 transition-colors duration-150 hover:border-gold/40 hover:bg-surface-2 sm:flex-none ${next ? "flex-row-reverse text-right" : ""}`}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-dim transition-colors duration-150 group-hover:bg-gold group-hover:text-primary-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-xs text-dim">{next ? "Next ledger" : "Previous ledger"}</span>
        <span className="text-sm font-medium tabular-nums">{sequence.toLocaleString("en-US")}</span>
      </span>
    </Link>
  );
}
