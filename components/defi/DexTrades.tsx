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
import { Amount } from "@/components/stellar/Amount";
import { Time } from "@/components/stellar/Time";
import { EmptyState } from "@/components/states/EmptyState";
import type { DexTrade } from "@/lib/stellar/defi";

// latest classic DEX fills, one row per trade
export function DexTrades({ trades }: { trades: DexTrade[] | null }) {
  if (!trades) {
    return <EmptyState message="Mainnet Horizon didn't respond, so recent trades are missing. They'll be back on the next refresh." />;
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
        {trades.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="pl-4 whitespace-nowrap">
              <Time iso={t.closedAt} />
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
