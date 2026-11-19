import Link from "next/link";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine } from "lucide-react";
import { Address } from "@/components/stellar/Address";
import { Amount } from "@/components/stellar/Amount";
import { Time } from "@/components/stellar/Time";
import { PoolPair, assetCodeOf } from "@/components/pool/PoolPair";
import type { AssetIdentity } from "@/lib/stellar/assetId";
import type { PoolActivity } from "@/lib/stellar/pools";

const KIND = {
  trade: { icon: ArrowLeftRight, verb: "Swapped", join: "for" },
  deposit: { icon: ArrowDownToLine, verb: "Deposited", join: "and" },
  withdraw: { icon: ArrowUpFromLine, verb: "Withdrew", join: "and" },
} as const;

const issuerOf = (identity: AssetIdentity) => (identity.kind === "issued" ? identity.issuer : undefined);

// one trade, deposit or withdrawal; across many pools it also names the pool
export function PoolActivityRow({
  activity,
  pool,
}: {
  activity: PoolActivity;
  pool?: { id: string; a: AssetIdentity; b: AssetIdentity };
}) {
  const { icon: Icon, verb, join } = KIND[activity.kind];
  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        <Icon className="size-4 shrink-0 text-dim" aria-hidden="true" />
        <span className="text-dim">{verb}</span>
        {activity.legs.map((leg, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            {i > 0 && <span className="text-dim">{join}</span>}
            <Amount
              amount={leg.amount}
              assetCode={assetCodeOf(leg.identity)}
              assetIssuer={issuerOf(leg.identity)}
              maxDecimals={4}
            />
          </span>
        ))}
        {pool && (
          <>
            <span className="text-dim">in</span>
            <Link href={`/pool/${pool.id}`} className="rounded-sm hover:text-gold">
              <PoolPair a={pool.a} b={pool.b} size={16} />
            </Link>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-sm">
        <Address address={activity.account} copy={false} />
        {activity.txHash ? (
          <Link href={`/tx/${activity.txHash}`} className="rounded-sm" aria-label="View transaction">
            <Time iso={activity.createdAt} className="hover:text-foreground" />
          </Link>
        ) : (
          <Time iso={activity.createdAt} />
        )}
      </div>
    </div>
  );
}
