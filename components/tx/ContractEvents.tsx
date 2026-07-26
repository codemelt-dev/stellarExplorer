import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Address } from "@/components/stellar/Address";
import { ScValView } from "@/components/stellar/ScValView";
import {
  describeTokenEvent,
  type DecodedContractEvent,
} from "@/lib/stellar/xdrDecode";

// Known token events (transfer/mint/burn/clawback) read as a sentence;
// anything else falls back to raw topics + data. Decoded by default.
export function ContractEvents({ events }: { events: DecodedContractEvent[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {events.length} contract event{events.length === 1 ? "" : "s"}
      </h2>
      <Card className="gap-4 p-5">
        {events.map((event, i) => {
          const d = describeTokenEvent(event);
          return (
            <div key={i} className="flex flex-col gap-1.5">
              {i > 0 && <Separator className="mb-2" />}
              {d ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-mono text-xs text-dim">#{i}</span>
                  {event.contractId && <Address address={event.contractId} />}
                  <Badge
                    variant="outline"
                    className="w-fit font-mono text-[11px] text-contract"
                  >
                    {d.kind}
                  </Badge>
                  {d.kind === "transfer" && (
                    <>
                      <Address address={d.from!} />
                      <ArrowRight className="size-3.5 shrink-0 text-dim" />
                      <Address address={d.to!} />
                    </>
                  )}
                  {d.kind === "mint" && (
                    <>
                      <span className="text-dim">to</span>
                      <Address address={d.to!} />
                    </>
                  )}
                  {(d.kind === "burn" || d.kind === "clawback") && (
                    <>
                      <span className="text-dim">from</span>
                      <Address address={d.from!} />
                    </>
                  )}
                  <span className="ml-auto font-mono text-sm">{d.amount}</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-dim">#{i}</span>
                    {event.contractId && <Address address={event.contractId} />}
                    <span className="flex flex-wrap gap-1">
                      {event.topics.map((topic, j) => (
                        <span
                          key={j}
                          className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-contract"
                        >
                          <ScValView value={topic} />
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="pl-6">
                    <ScValView value={event.data} />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </Card>
    </section>
  );
}
