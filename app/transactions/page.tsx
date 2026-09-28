import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Address } from "@/components/stellar/Address";
import { Amount } from "@/components/stellar/Amount";
import { Time } from "@/components/stellar/Time";
import { CopyButton } from "@/components/stellar/CopyButton";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Pager } from "@/components/layout/Pager";
import { AutoRefresh } from "@/components/live/AutoRefresh";
import { getRecentTransactions, type TxRow } from "@/lib/stellar/transactions";
import { txTypeLabel } from "@/lib/stellar/humanize";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { truncateKey } from "@/lib/stellar/strkey";
import { activeNetwork } from "@/lib/stellar/network";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Transactions · Stellar Explorer" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const network = await activeNetwork();

  let rows: TxRow[];
  try {
    rows = await getRecentTransactions(cursor);
  } catch {
    return (
      <ErrorState
        message="Horizon didn't respond while loading transactions. Reload the page to retry."
        className="py-24"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!cursor && <AutoRefresh />}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-dim">
            {cursor
              ? `Older transactions on ${network.label.toLowerCase()}.`
              : `Latest on ${network.label.toLowerCase()}, updating live. Failed ones included.`}
          </p>
        </div>
        <StatusLegend />
      </div>

      <Card className="gap-0 p-0">
        {rows.length === 0 ? (
          <EmptyState message="No transactions on this page. Go back to the latest ones." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8 pl-4" aria-label="Status" />
                <TableHead>Hash</TableHead>
                <TableHead>Ledger</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Ops</TableHead>
                <TableHead className="pr-4 text-right">Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => {
                const type = txTypeLabel(tx.opTypes);
                return (
                  <ClickableRow
                    key={tx.hash}
                    href={`/tx/${tx.hash}`}
                    className={cn("border-b border-border last:border-b-0", !tx.successful && "bg-fail/5")}
                  >
                    <TableCell className="pl-4">
                      {tx.successful ? (
                        <CheckCircle2 className="size-4 text-ok" aria-label="Success" />
                      ) : (
                        <XCircle className="size-4 text-fail" aria-label="Failed" />
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/tx/${tx.hash}`}
                          className="rounded-sm font-mono text-gold hover:underline underline-offset-4"
                          title={tx.hash}
                        >
                          {truncateKey(tx.hash, 6)}
                        </Link>
                        <CopyButton value={tx.hash} label="Copy transaction hash" />
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/ledger/${tx.ledger}`}
                        className="rounded-sm tabular-nums hover:text-gold"
                      >
                        {tx.ledger.toLocaleString("en-US")}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Time iso={tx.createdAt} />
                    </TableCell>
                    <TableCell>
                      {type ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[11px]",
                            type.tone === "contract" ? "border-contract/40 text-contract" : "text-dim",
                          )}
                        >
                          {type.label}
                        </Badge>
                      ) : (
                        <span className="text-dim">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Address address={tx.source} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{tx.opCount}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Amount amount={stroopsToLumens(tx.feeStroops)} className="text-dim" />
                    </TableCell>
                  </ClickableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Pager
        basePath="/transactions"
        olderCursor={rows.length === 25 ? rows[rows.length - 1].pagingToken : null}
        isFirstPage={!cursor}
      />
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-dim">
      <span className="inline-flex items-center gap-1">
        <CheckCircle2 className="size-3.5 text-ok" aria-hidden="true" /> Success
      </span>
      <span className="inline-flex items-center gap-1">
        <XCircle className="size-3.5 text-fail" aria-hidden="true" /> Failed
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full bg-contract" aria-hidden="true" /> Contract call
      </span>
    </div>
  );
}
