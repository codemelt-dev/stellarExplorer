import { formatAmount, roundAmount } from "@/lib/stellar/amount";
import { AssetCode } from "./AssetCode";
import { cn } from "@/lib/utils";

// mono amounts with dimmed decimals. Issuer tooltip on non-native assets
export function Amount({
  amount,
  assetCode = "XLM",
  assetIssuer,
  assetHint,
  maxDecimals,
  className,
}: {
  /** Decimal string as returned by Horizon (never a float). */
  amount: string;
  /** Dense lists round to this; the exact value stays in the hover title. */
  maxDecimals?: number;
  assetCode?: string;
  assetIssuer?: string;
  /** Hover text on the code, for assets that have no issuer to show. */
  assetHint?: string;
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

  return (
    <span className={cn("font-mono text-sm whitespace-nowrap", className)} title={exact}>
      {dust && "<"}
      {int}
      {frac && <span className="text-dim">.{frac}</span>}{" "}
      <AssetCode code={assetCode} issuer={assetIssuer} hint={assetHint} className="text-dim" />
    </span>
  );
}
