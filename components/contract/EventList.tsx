"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { PagedList } from "@/components/layout/PagedList";
import { ErrorState } from "@/components/states/ErrorState";
import { ScValView } from "@/components/stellar/ScValView";
import { TokenEventSentence } from "@/components/stellar/TokenEventSentence";
import { Time } from "@/components/stellar/Time";
import type { TokenInfo } from "@/lib/stellar/contractDecode";
import type { ContractEventItem, ContractEventsPage } from "@/lib/stellar/contracts";

// A contract's events, newest first. Opening the last loaded page fetches the
// next older batch, one request at a time, so history loads only as it's read
export function EventList({
  contractId,
  first,
  ownToken,
}: {
  contractId: string;
  first: ContractEventsPage;
  /** The contract's own token metadata, when it is one. */
  ownToken?: TokenInfo;
}) {
  const [events, setEvents] = useState(first.events);
  const [next, setNext] = useState(first.next);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);

  const loadOlder = useCallback(() => {
    if (!next || loading.current) return;
    loading.current = true;
    fetch(`/api/contracts/${contractId}/events?before=${next}`)
      .then((res) => {
        if (!res.ok) throw new Error(`events ${res.status}`);
        return res.json() as Promise<ContractEventsPage>;
      })
      .then((page) => {
        setEvents((shown) => [...shown, ...page.events]);
        setNext(page.next);
      })
      .catch(() => setFailed(true))
      .finally(() => {
        loading.current = false;
      });
  }, [contractId, next]);

  return (
    <>
      <PagedList
        topId="events"
        className="flex flex-col"
        hasMore={next !== null && !failed}
        onLastPage={loadOlder}
      >
        {events.map((event, i) => (
          <EventRow key={`${event.txHash}-${i}`} event={event} ownToken={ownToken} />
        ))}
      </PagedList>
      {failed && (
        <ErrorState
          message="Couldn't load older events."
          onRetry={() => setFailed(false)}
          className="py-4"
        />
      )}
    </>
  );
}

function EventRow({ event, ownToken }: { event: ContractEventItem; ownToken?: TokenInfo }) {
  const when = (
    <Link href={`/tx/${event.txHash}`} className="shrink-0 rounded-sm" aria-label="View transaction">
      <Time iso={event.createdAt} className="hover:text-foreground" />
    </Link>
  );
  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
      {event.token ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <TokenEventSentence event={event.token} info={ownToken} />
          {when}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap gap-1">
              {event.topics.map((topic, j) => (
                <span key={j} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-contract">
                  <ScValView value={topic} />
                </span>
              ))}
            </span>
            {when}
          </div>
          <div className="pl-1">
            <ScValView value={event.data} />
          </div>
        </>
      )}
    </div>
  );
}
