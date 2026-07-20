import { formatAmount } from "@/lib/stellar/amount";
import { truncateKey } from "@/lib/stellar/strkey";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// mono amounts with dimmed decimals. Issuer tooltip on non-native assets
export function Amount({
  amount,
  assetCode = "XLM",
  assetIssuer,
  className,
}: {
  /** Decimal string as returned by Horizon (never a float). */
  amount: string;
  assetCode?: string;
  assetIssuer?: string;
  className?: string;
}) {
  const { int, frac } = formatAmount(amount);

  const code = assetIssuer ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help text-dim">{assetCode}</span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-xs">
          issued by {truncateKey(assetIssuer)}
        </span>
      </TooltipContent>
    </Tooltip>
  ) : (
    <span className="text-dim">{assetCode}</span>
  );

  return (
    <span className={cn("font-mono text-sm whitespace-nowrap", className)}>
      {int}
      {frac && <span className="text-dim">.{frac}</span>} {code}
    </span>
  );
}
