import { Amount } from "@/components/stellar/Amount";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatAmount, stroopsToLumens, unitsToDecimal } from "@/lib/stellar/amount";
import type { TokenInfo } from "@/lib/stellar/contractDecode";
import { truncateKey } from "@/lib/stellar/strkey";
import type { AssetRef } from "@/lib/stellar/txFlow";
import { cn } from "@/lib/utils";

// amount out of a token contract event, three levels of certainty:
// a Stellar asset (7 decimals, issuer known), a token that reports its own
// symbol and decimals, or neither, where the base units show unscaled rather
// than as a number that could be off by orders of magnitude
export function TokenAmount({
  amount,
  asset,
  info,
  token,
  className,
}: {
  /** Base units (i128) as a digit string. */
  amount: string;
  /** Set when the token is a Stellar asset's own contract. */
  asset?: AssetRef;
  /** What the token contract reports about itself. */
  info?: TokenInfo | null;
  /** Token contract id, named in the hover text. */
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
  const contract = token ? `token contract ${truncateKey(token, 4)}` : "the token contract";
  if (info) {
    return (
      <Amount
        amount={unitsToDecimal(amount, info.decimals)}
        assetCode={info.symbol}
        assetHint={`Symbol as reported by ${contract}. Not a Stellar asset, check the contract address.`}
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
          Smallest units of {token ? `token ${truncateKey(token, 4)}` : "this token"}. It
          doesn&apos;t publish its decimals, so the amount is shown unscaled.
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
