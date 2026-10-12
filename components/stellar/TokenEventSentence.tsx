import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Address } from "@/components/stellar/Address";
import { TokenAmount } from "@/components/stellar/TokenAmount";
import type { TokenEventDescription } from "@/lib/stellar/xdrDecode";

// a token event as a sentence: what happened, between whom, how much.
// Renders inline pieces, the caller owns the row
export function TokenEventSentence({ event }: { event: TokenEventDescription }) {
  return (
    <>
      <Badge variant="outline" className="w-fit font-mono text-[11px] text-contract">
        {event.kind}
      </Badge>
      {event.kind === "transfer" && (
        <>
          <Address address={event.from!} />
          <ArrowRight className="size-3.5 shrink-0 text-dim" />
          <Address address={event.to!} />
        </>
      )}
      {event.kind === "mint" && (
        <>
          <span className="text-dim">to</span>
          <Address address={event.to!} />
        </>
      )}
      {(event.kind === "burn" || event.kind === "clawback") && (
        <>
          <span className="text-dim">from</span>
          <Address address={event.from!} />
        </>
      )}
      <TokenAmount amount={event.amount} asset={event.asset} className="ml-auto" />
    </>
  );
}
