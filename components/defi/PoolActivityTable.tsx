import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Address } from "@/components/stellar/Address";
import { Amount } from "@/components/stellar/Amount";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { Time } from "@/components/stellar/Time";
import { PagedList } from "@/components/layout/PagedList";
import { PoolPair, assetCodeOf } from "@/components/pool/PoolPair";
import type { AssetIdentity } from "@/lib/stellar/assetId";
import type { ProtocolActivity } from "@/lib/stellar/pools";

const ACTION = { trade: "swap", deposit: "deposit", withdraw: "withdraw" } as const;

const issuerOf = (identity: AssetIdentity) => (identity.kind === "issued" ? identity.issuer : undefined);

// the Stellar DEX trades table's columns, the pool in place of the venue; it
// scrolls sideways on narrow screens like that table does
const grid =
  "grid min-w-[60rem] grid-cols-[7rem_6rem_11rem_minmax(0,1fr)_10rem_7rem] items-center gap-x-2";

// what was received per unit paid, as the trades table prices a fill
function priceOf(a: ProtocolActivity): string {
  if (a.kind !== "trade" || a.legs.length !== 2) return "–";
  const paid = Number(a.legs[0].amount);
  return paid > 0 ? (Number(a.legs[1].amount) / paid).toPrecision(5) : "–";
}

// swaps, deposits and withdrawals across a protocol's pools, a row opens its transaction
export function PoolActivityTable({ activity, topId }: { activity: ProtocolActivity[]; topId: string }) {
  return (
    <PagedList
      topId={topId}
      className="overflow-x-auto"
      header={
        <div className={`${grid} h-10 border-b border-border text-sm font-medium`}>
          <span>Age</span>
          <span>Action</span>
          <span>Trader</span>
          <span>Amount</span>
          <span>Pool</span>
          <span className="text-right">Price</span>
        </div>
      }
    >
      {activity.map((a, i) => (
        <ClickableRow
          key={`${a.txHash}-${a.pool.id}-${i}`}
          as="div"
          href={`/tx/${a.txHash}`}
          className={`${grid} border-b border-border py-2 text-sm last:border-b-0`}
        >
          <span className="whitespace-nowrap">
            <Link href={`/tx/${a.txHash}`} className="rounded-sm" aria-label="View transaction">
              <Time iso={a.createdAt} className="hover:text-foreground" />
            </Link>
          </span>
          <span>
            <Badge variant="outline" className="font-mono text-[11px] text-dim">
              {ACTION[a.kind]}
            </Badge>
          </span>
          <span className="min-w-0">
            <Address address={a.account} />
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            {a.legs.map((leg, k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                {k > 0 &&
                  (a.kind === "trade" ? (
                    <ArrowLeftRight className="size-3.5 shrink-0 text-dim" aria-label="for" />
                  ) : (
                    <Plus className="size-3.5 shrink-0 text-dim" aria-label="and" />
                  ))}
                <Amount amount={leg.amount} assetCode={assetCodeOf(leg.identity)} assetIssuer={issuerOf(leg.identity)} />
              </span>
            ))}
          </span>
          <span className="min-w-0">
            <Link href={`/pool/${a.pool.id}`} className="rounded-sm hover:text-gold">
              <PoolPair a={a.pool.a} b={a.pool.b} size={16} />
            </Link>
          </span>
          <span className="text-right font-mono whitespace-nowrap">{priceOf(a)}</span>
        </ClickableRow>
      ))}
    </PagedList>
  );
}
