import Link from "next/link";
import { Address } from "@/components/stellar/Address";
import { Identicon } from "@/components/stellar/Identicon";
import { StellarMark } from "@/components/stellar/StellarMark";
import { assetHref, type AssetIdentity } from "@/lib/stellar/assetId";
import { truncateKey } from "@/lib/stellar/strkey";

// an asset in a list: issuer identicon, code, short issuer. Lumens get the
// Stellar mark; a Soroban-only token is shown as the contract it is
export function AssetLabel({ identity }: { identity: AssetIdentity }) {
  if (identity.kind === "contract") {
    return <Address address={identity.contractId} copy={false} chars={6} />;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {identity.kind === "native" ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2">
          <StellarMark className="size-3" />
        </span>
      ) : (
        <Identicon address={identity.issuer} size={20} className="shrink-0 rounded-full" />
      )}
      <Link
        href={assetHref(identity)}
        className="rounded-sm font-medium text-gold underline-offset-4 hover:underline"
      >
        {identity.code}
      </Link>
      <span
        className="hidden truncate font-mono text-xs text-dim sm:inline"
        title={identity.kind === "issued" ? identity.issuer : undefined}
      >
        {identity.kind === "native" ? "native" : truncateKey(identity.issuer, 6)}
      </span>
    </span>
  );
}
