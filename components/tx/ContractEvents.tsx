import { Card } from "@/components/ui/card";
import { PagedList } from "@/components/layout/PagedList";
import { Address } from "@/components/stellar/Address";
import { ScValView } from "@/components/stellar/ScValView";
import { TokenEventSentence } from "@/components/stellar/TokenEventSentence";
import type { TokenInfo } from "@/lib/stellar/contractDecode";
import {
  describeTokenEvent,
  type DecodedContractEvent,
} from "@/lib/stellar/xdrDecode";

// Known token events (transfer/mint/burn/clawback) read as a sentence;
// anything else falls back to raw topics + data. Decoded by default.
export function ContractEvents({
  events,
  passphrase,
  tokens = {},
}: {
  events: DecodedContractEvent[];
  /** Self-reported symbol and decimals of the tokens involved, by contract id. */
  tokens?: Record<string, TokenInfo | null>;
  /** Network passphrase, to tell a Stellar asset's contract from a lookalike. */
  passphrase: string;
}) {
  return (
    <section id="events" className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {events.length} contract event{events.length === 1 ? "" : "s"}
      </h2>
      <Card className="gap-4 p-5">
        <PagedList topId="events" className="flex flex-col">
          {events.map((event, i) => {
            const d = describeTokenEvent(event, passphrase);
            return (
              <div
                key={i}
                className="flex flex-col gap-1.5 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
              >
                {d ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-mono text-xs text-dim">#{i}</span>
                    {event.contractId && <Address address={event.contractId} />}
                    <TokenEventSentence event={d} info={tokens[d.token]} />
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
        </PagedList>
      </Card>
    </section>
  );
}
