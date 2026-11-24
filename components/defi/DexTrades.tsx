import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
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
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { Amount } from "@/components/stellar/Amount";
import { Time } from "@/components/stellar/Time";
import { EmptyState } from "@/components/states/EmptyState";
import type { DexTrade } from "@/lib/stellar/defi";

// latest classic DEX fills, one row per trade; a row opens its transaction
export function DexTrades({ trades }: { trades: DexTrade[] | null }) {
  if (!trades) {
    return <EmptyState message="Couldn't load recent mainnet trades. They'll be back on the next refresh." />;
  }
  if (trades.length === 0) {
    return <EmptyState message="No trades returned. The DEX is rarely this quiet, try again in a minute." />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Age</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Trader</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="pr-4 text-right">Venue</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((t) => {
          const cells = (
            <>
              <TableCell className="pl-4 whitespace-nowrap">
                {t.txHash ? (
                  <Link href={`/tx/${t.txHash}`} className="rounded-sm" aria-label="View transaction">
                    <Time iso={t.closedAt} className="hover:text-foreground" />
                  </Link>
                ) : (
                  <Time iso={t.closedAt} />
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono text-[11px] text-dim">
                  {t.venue === "pool" ? "swap" : "trade"}
                </Badge>
              </TableCell>
              <TableCell>
                {t.account ? (
                  <Address address={t.account} />
                ) : (
                  <span className="text-dim">Liquidity pool</span>
                )}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Amount amount={t.baseAmount} assetCode={t.baseCode} assetIssuer={t.baseIssuer} />
                  <ArrowLeftRight className="size-3.5 shrink-0 text-dim" aria-label="for" />
                  <Amount amount={t.counterAmount} assetCode={t.counterCode} assetIssuer={t.counterIssuer} />
                </span>
              </TableCell>
              <TableCell className="text-right font-mono whitespace-nowrap">
                {t.price.toPrecision(5)}
              </TableCell>
              <TableCell className="pr-4 text-right text-dim">
                {t.venue === "pool" ? "AMM pool" : "Orderbook"}
              </TableCell>
            </>
          );
          return t.txHash ? (
            <ClickableRow key={t.id} href={`/tx/${t.txHash}`}>
              {cells}
            </ClickableRow>
          ) : (
            <TableRow key={t.id}>{cells}</TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
