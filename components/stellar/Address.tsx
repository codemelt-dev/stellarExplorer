import Link from "next/link";
import { Identicon } from "./Identicon";
import { CopyButton } from "./CopyButton";
import { addressKind, truncateKey } from "@/lib/stellar/strkey";
import { cn } from "@/lib/utils";

// identicon + truncated key + copy. Contracts get the violet tint
export function Address({
  address,
  link = true,
  chars = 4,
  className,
}: {
  address: string;
  link?: boolean;
  chars?: number;
  className?: string;
}) {
  const kind = addressKind(address);
  const truncated = truncateKey(address, chars);

  const href =
    kind === "contract"
      ? `/contract/${address}`
      : kind === "unknown"
        ? null
        : `/account/${address}`;

  const kindLabel =
    kind === "contract"
      ? "Smart contract"
      : kind === "muxedAccount"
        ? "Muxed account"
        : "Account";

  const key = (
    <span
      className={cn(
        "font-mono text-sm",
        kind === "contract" ? "text-contract" : "text-foreground",
      )}
      title={`${kindLabel} · ${address}`}
    >
      {truncated}
    </span>
  );

  return (
    <span className={cn("inline-flex items-center gap-1.5 align-middle", className)}>
      <Identicon address={address} size={16} className="shrink-0 rounded-[3px]" />
      {link && href ? (
        <Link
          href={href}
          className="rounded-sm transition-colors duration-150 hover:underline hover:decoration-dotted underline-offset-4"
        >
          {key}
        </Link>
      ) : (
        key
      )}
      <CopyButton value={address} label="Copy address" />
    </span>
  );
}
