import { Identicon } from "@/components/stellar/Identicon";
import { StellarMark } from "@/components/stellar/StellarMark";
import type { AssetIdentity } from "@/lib/stellar/assetId";
import { truncateKey } from "@/lib/stellar/strkey";
import { cn } from "@/lib/utils";

export const assetCodeOf = (identity: AssetIdentity) =>
  identity.kind === "contract" ? truncateKey(identity.contractId, 4) : identity.code;

const issuedBy = (identity: AssetIdentity) =>
  identity.kind === "issued" ? `${identity.code} issued by ${identity.issuer}` : undefined;

function Mark({ identity, size }: { identity: AssetIdentity; size: number }) {
  if (identity.kind === "native") {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 ring-2 ring-card"
        style={{ width: size, height: size }}
      >
        <StellarMark className="size-3/5" />
      </span>
    );
  }
  return (
    <Identicon
      address={identity.kind === "issued" ? identity.issuer : identity.contractId}
      size={size}
      className="shrink-0 rounded-full bg-surface ring-2 ring-card"
    />
  );
}

// the two assets of a pool: overlapping marks, then CODE / CODE. Issuers on hover
export function PoolPair({
  a,
  b,
  size = 20,
  className,
}: {
  a: AssetIdentity;
  b: AssetIdentity;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <span className="flex shrink-0 -space-x-1.5">
        <Mark identity={a} size={size} />
        <Mark identity={b} size={size} />
      </span>
      <span className="truncate font-medium">
        <span title={issuedBy(a)}>{assetCodeOf(a)}</span>
        <span className="text-dim"> / </span>
        <span title={issuedBy(b)}>{assetCodeOf(b)}</span>
      </span>
    </span>
  );
}
