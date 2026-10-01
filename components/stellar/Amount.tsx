import { formatAmount, roundAmount } from "@/lib/stellar/amount";
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
  maxDecimals,
  className,
}: {
  /** Decimal string as returned by Horizon (never a float). */
  amount: string;
  /** Dense lists round to this; the exact value stays in the hover title. */
  maxDecimals?: number;
  assetCode?: string;
  assetIssuer?: string;
  className?: string;
}) {
  const full = formatAmount(amount);
  const rounded = maxDecimals === undefined ? amount : roundAmount(amount, maxDecimals);
  // dust that rounds to zero reads as "<0.0001", never as a misleading 0
  const dust = maxDecimals !== undefined && rounded === "0" && /[1-9]/.test(amount);
  const { int, frac } = dust
    ? formatAmount(`0.${"0".repeat(Math.max(maxDecimals - 1, 0))}1`)
    : formatAmount(rounded);
  const wasRounded = dust || int !== full.int || frac !== full.frac;
  const exact = wasRounded ? `${full.int}${full.frac ? `.${full.frac}` : ""} ${assetCode}` : undefined;

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
    <span className={cn("font-mono text-sm whitespace-nowrap", className)} title={exact}>
      {dust && "<"}
      {int}
      {frac && <span className="text-dim">.{frac}</span>} {code}
    </span>
  );
}
