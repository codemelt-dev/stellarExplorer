import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, CheckCircle2, FileCode2, Layers, Send, XCircle } from "lucide-react";
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
import { listHeadClass } from "@/components/layout/listTable";
import { TypeTabs, type TypeTab } from "@/components/layout/TypeTabs";
import { FlowTarget } from "@/components/tx/FlowTarget";
import { AutoRefresh } from "@/components/live/AutoRefresh";
import { getRecentTransactions, type TxPage } from "@/lib/stellar/transactions";
import type { HistoryFilter } from "@/lib/stellar/opFilters";
import { txTypeLabel } from "@/lib/stellar/humanize";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { truncateKey } from "@/lib/stellar/strkey";
import { activeNetwork } from "@/lib/stellar/network";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Transactions · Stellar Explorer" };

const TABS: TypeTab<HistoryFilter>[] = [
  { id: "all", label: "All", icon: Layers },
  { id: "payments", label: "Payments", icon: Send },
  { id: "trades", label: "Trades", icon: ArrowLeftRight },
  { id: "contracts", label: "Contracts", icon: FileCode2 },
];

const EMPTY_NOUN: Record<HistoryFilter, string> = {
  all: "transactions",
  payments: "payments",
  trades: "trades",
  contracts: "contract calls",
};

function parseType(value?: string): HistoryFilter {
  return TABS.some((t) => t.id === value) ? (value as HistoryFilter) : "all";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; type?: string }>;
}) {
  const params = await searchParams;
  const cursor = params.cursor;
  const type = parseType(params.type);
  const network = await activeNetwork();

  let page: TxPage;
  try {
    page = await getRecentTransactions(cursor, type);
  } catch {
    return (
      <ErrorState
        message="Horizon didn't respond while loading transactions. Reload the page to retry."
        className="py-24"
      />
    );
  }

  const { rows } = page;

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

      <TypeTabs tabs={TABS} active={type} basePath="/transactions" label="Transaction types" />

      <Card className="gap-0 p-0">
        {rows.length === 0 ? (
          <EmptyState
            message={
              type === "all"
                ? "No transactions on this page. Go back to the latest ones."
                : `No ${EMPTY_NOUN[type]} in the last ${page.scanned.toLocaleString("en-US")} transactions.${page.nextCursor ? " Older ones may have some." : ""}`
            }
          />
        ) : (
          <Table>
            <TableHeader className={listHeadClass}>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8 pl-4" aria-label="Status" />
                <TableHead>Tx Hash</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="w-8 px-0" aria-label="Direction" />
                <TableHead>To / interacted with</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden pr-4 text-right xl:table-cell">Fee</TableHead>
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
                    <TableCell className="whitespace-nowrap">
                      <span className="flex flex-col leading-tight">
                        <Time iso={tx.createdAt} />
                        <Link
                          href={`/ledger/${tx.ledger}`}
                          className="w-fit rounded-sm text-xs tabular-nums text-dim hover:text-gold"
                          title="Ledger"
                        >
                          #{tx.ledger.toLocaleString("en-US")}
                        </Link>
                      </span>
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
                      <Address address={tx.flow.from} copy={false} />
                    </TableCell>
                    <TableCell className="px-0">
                      <span className="flex size-6 items-center justify-center rounded-full bg-surface-2">
                        <ArrowRight className="size-3.5 text-dim" aria-hidden="true" />
                      </span>
                    </TableCell>
                    <TableCell>
                      <FlowTarget target={tx.flow.to} moreOps={tx.flow.moreOps} />
                    </TableCell>
                    <TableCell className="text-right">
                      {tx.flow.amount ? (
                        <Amount
                          amount={tx.flow.amount.value}
                          assetCode={tx.flow.amount.asset.code}
                          assetIssuer={tx.flow.amount.asset.issuer}
                          maxDecimals={4}
                        />
                      ) : (
                        <span className="text-dim">–</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden pr-4 text-right xl:table-cell">
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
        olderCursor={page.nextCursor}
        isFirstPage={!cursor}
        query={type === "all" ? {} : { type }}
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
