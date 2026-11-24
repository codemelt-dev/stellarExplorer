import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Address } from "@/components/stellar/Address";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { Time } from "@/components/stellar/Time";
import { PagedList } from "@/components/layout/PagedList";
import type { ContractCall } from "@/lib/stellar/contracts";

// same table grammar as the DEX trades and pool activity; scrolls sideways on narrow screens
const grid = "grid min-w-[36rem] grid-cols-[7rem_minmax(0,1fr)_12rem_6rem] items-center gap-x-2";

// a contract's newest calls, a row opens its transaction
export function CallList({ calls }: { calls: ContractCall[] }) {
  const rows = calls.map((c, i) => {
    const cells = (
      <>
        <span className="whitespace-nowrap">
          {c.txHash ? (
            <Link href={`/tx/${c.txHash}`} className="rounded-sm" aria-label="View transaction">
              <Time iso={c.createdAt} className="hover:text-foreground" />
            </Link>
          ) : (
            <Time iso={c.createdAt} />
          )}
        </span>
        <span className="min-w-0">
          <Badge variant="outline" className="max-w-full truncate font-mono text-[11px] text-contract">
            {c.fn}
          </Badge>
        </span>
        <span className="min-w-0">
          <Address address={c.caller} />
        </span>
        <span className="inline-flex items-center justify-end gap-1.5 text-right text-dim">
          {c.successful ? (
            <CheckCircle2 className="size-3.5 text-ok" aria-hidden="true" />
          ) : (
            <XCircle className="size-3.5 text-fail" aria-hidden="true" />
          )}
          {c.successful ? "ok" : "failed"}
        </span>
      </>
    );
    const className = `${grid} border-b border-border py-2 text-sm last:border-b-0`;
    return c.txHash ? (
      <ClickableRow key={`${c.txHash}-${i}`} as="div" href={`/tx/${c.txHash}`} className={className}>
        {cells}
      </ClickableRow>
    ) : (
      <div key={`${c.ledger}-${i}`} className={className}>
        {cells}
      </div>
    );
  });

  return (
    <PagedList
      topId="calls"
      className="overflow-x-auto"
      header={
        <div className={`${grid} h-10 border-b border-border text-sm font-medium`}>
          <span>Age</span>
          <span>Function</span>
          <span>Caller</span>
          <span className="text-right">Result</span>
        </div>
      }
    >
      {rows}
    </PagedList>
  );
}
