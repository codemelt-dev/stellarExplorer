"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { truncateKey } from "@/lib/stellar/strkey";
import { cn } from "@/lib/utils";

// an asset code, its issuer (or a hint) on hover. Built here on the client:
// a server-built child can reach Radix's Slot as a lazy reference, which it
// can't slot onto, and the whole page fails
export function AssetCode({
  code,
  issuer,
  hint,
  className,
}: {
  code: string;
  issuer?: string;
  hint?: string;
  className?: string;
}) {
  if (!issuer && !hint) return <span className={className}>{code}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("cursor-help", className)}>{code}</span>
      </TooltipTrigger>
      <TooltipContent>
        {issuer ? (
          <span className="font-mono text-xs">issued by {truncateKey(issuer)}</span>
        ) : (
          <span className="text-xs">{hint}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
