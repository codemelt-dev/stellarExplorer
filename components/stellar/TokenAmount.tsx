import { Amount } from "@/components/stellar/Amount";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatAmount, stroopsToLumens } from "@/lib/stellar/amount";
import { truncateKey } from "@/lib/stellar/strkey";
import type { AssetRef } from "@/lib/stellar/txFlow";
import { cn } from "@/lib/utils";

// amount out of a token contract event. Stellar assets have 7 decimals; any
// other token's decimals aren't in the event, so its units show unscaled
// rather than as a number that could be off by orders of magnitude
export function TokenAmount({
  amount,
  asset,
  token,
  className,
}: {
  /** Base units (i128) as a digit string. */
  amount: string;
  /** Set when the token is a Stellar asset's own contract. */
  asset?: AssetRef;
  /** Token contract id, named in the hint when the asset is unknown. */
  token?: string;
  className?: string;
}) {
  if (asset) {
    return (
      <Amount
        amount={stroopsToLumens(amount)}
        assetCode={asset.code}
        assetIssuer={asset.issuer}
        className={className}
      />
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("cursor-help font-mono text-sm whitespace-nowrap", className)}>
          {formatAmount(amount).int} <span className="text-dim">units</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="text-xs">
          Smallest units of {token ? `token ${truncateKey(token, 4)}` : "this token"}. Its
          decimals aren&apos;t part of the event, so the amount is shown unscaled.
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
