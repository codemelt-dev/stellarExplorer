import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Amount } from "@/components/stellar/Amount";
import { Time } from "@/components/stellar/Time";
import { CopyButton } from "@/components/stellar/CopyButton";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Pager } from "@/components/layout/Pager";
import { AutoRefresh } from "@/components/live/AutoRefresh";
import { getRecentLedgers, type LedgerRow } from "@/lib/stellar/ledgers";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { truncateKey } from "@/lib/stellar/strkey";
import { activeNetwork } from "@/lib/stellar/network";

export const metadata: Metadata = { title: "Ledgers · Stellar Explorer" };

export default async function LedgersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const network = await activeNetwork();

  let rows: LedgerRow[];
  try {
    rows = await getRecentLedgers(cursor);
  } catch {
    return (
      <ErrorState
        message="Horizon didn't respond while loading ledgers. Reload the page to retry."
        className="py-24"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!cursor && <AutoRefresh />}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ledgers</h1>
        <p className="text-sm text-dim">
          {cursor
            ? `Older ledgers on ${network.label.toLowerCase()}.`
            : `Latest on ${network.label.toLowerCase()}, a new one closes about every five seconds.`}
        </p>
      </div>

      <Card className="gap-0 p-0">
        {rows.length === 0 ? (
          <EmptyState message="No ledgers on this page. Go back to the latest ones." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Ledger</TableHead>
                <TableHead>Hash</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead className="text-right">Txs</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Ops</TableHead>
                <TableHead className="text-right">Success rate</TableHead>
                <TableHead className="pr-4 text-right">Base fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => {
                const total = l.txOk + l.txFailed;
                const rate = total > 0 ? (l.txOk / total) * 100 : null;
                return (
                  <ClickableRow
                    key={l.sequence}
                    href={`/ledger/${l.sequence}`}
                    label={`Open ledger ${l.sequence}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <TableCell className="pl-4">
                      <Link
                        href={`/ledger/${l.sequence}`}
                        className="rounded-sm font-medium text-gold tabular-nums hover:underline underline-offset-4"
                      >
                        {l.sequence.toLocaleString("en-US")}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-dim" title={l.hash}>
                          {truncateKey(l.hash, 6)}
                        </span>
                        <CopyButton value={l.hash} label="Copy ledger hash" />
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Time iso={l.closedAt} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{total}</TableCell>
                    <TableCell
                      className={
                        l.txFailed > 0
                          ? "text-right tabular-nums text-fail"
                          : "text-right tabular-nums text-dim"
                      }
                    >
                      {l.txFailed}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.opCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rate === null ? <span className="text-dim">–</span> : `${rate.toFixed(1)}%`}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Amount amount={stroopsToLumens(l.baseFeeStroops)} className="text-dim" />
                    </TableCell>
                  </ClickableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Pager
        basePath="/ledgers"
        olderCursor={rows.length === 25 ? rows[rows.length - 1].pagingToken : null}
        isFirstPage={!cursor}
      />
    </div>
  );
}
