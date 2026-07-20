import { Address } from "./Address";
import { Amount } from "./Amount";
import { truncateKey } from "@/lib/stellar/strkey";
import type { Segment } from "@/lib/stellar/humanize";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// renders humanize() segments with the real components inline
export function OpSentence({ segments }: { segments: Segment[] }) {
  return (
    <span className="leading-7">
      {segments.map((segment, i) => {
        switch (segment.kind) {
          case "text":
            return <span key={i}>{segment.text}</span>;
          case "address":
            return segment.address ? (
              <Address key={i} address={segment.address} />
            ) : (
              <span key={i} className="text-dim">
                (unknown)
              </span>
            );
          case "amount":
            return (
              <Amount
                key={i}
                amount={segment.amount}
                assetCode={segment.assetCode}
                assetIssuer={segment.assetIssuer}
                className="text-foreground"
              />
            );
          case "asset":
            return segment.assetIssuer ? (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <span className="cursor-help font-mono text-sm">
                    {segment.assetCode}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="font-mono text-xs">
                    issued by {truncateKey(segment.assetIssuer)}
                  </span>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span key={i} className="font-mono text-sm">
                {segment.assetCode}
              </span>
            );
          case "code":
            return (
              <span key={i} className="font-mono text-sm">
                {segment.text}
              </span>
            );
        }
      })}
    </span>
  );
}
