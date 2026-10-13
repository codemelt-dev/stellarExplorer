import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ChevronsLeft, Download, FileCode2, SearchX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Address } from "@/components/stellar/Address";
import { Identicon } from "@/components/stellar/Identicon";
import { CopyButton } from "@/components/stellar/CopyButton";
import { ScValView } from "@/components/stellar/ScValView";
import { TokenEventSentence } from "@/components/stellar/TokenEventSentence";
import { Time } from "@/components/stellar/Time";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { PagedList } from "@/components/layout/PagedList";
import { activeNetwork } from "@/lib/stellar/network";
import {
  getContractCreation,
  getContractEvents,
  getContractInterface,
  getContractStorage,
  getContractSummary,
} from "@/lib/stellar/contracts";
import { contractAsset, tokenMetadata } from "@/lib/stellar/contractDecode";
import { describeTokenEvent, type DecodedValue } from "@/lib/stellar/xdrDecode";
import { truncateKey } from "@/lib/stellar/strkey";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Contract ${truncateKey(id, 6)} · Stellar Explorer` };
}

const pageLink =
  "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors duration-150 hover:bg-surface-2";

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ after?: string }>;
}) {
  const [{ id }, { after }] = await Promise.all([params, searchParams]);
  const network = await activeNetwork();
  const netLabel = network.label.toLowerCase();

  let summary, iface, events, creation, storage;
  try {
    [summary, iface, events, creation, storage] = await Promise.all([
      getContractSummary(id),
      getContractInterface(id),
      getContractEvents(id),
      getContractCreation(id),
      getContractStorage(id, after),
    ]);
  } catch {
    return (
      <ErrorState
        message="The indexer didn't respond while loading this contract. Reload the page to retry."
        className="py-24"
      />
    );
  }

  if (!summary) {
    return (
      <EmptyState
        icon={SearchX}
        message={`No contract ${truncateKey(id, 8)} on ${netLabel}. It may live on another network, or its instance may have been archived.`}
        className="py-24"
      />
    );
  }

  const isSac = summary.executable.kind === "stellarAsset";
  // which asset this is, when the contract is a Stellar asset's own
  const asset = contractAsset(summary, network.passphrase);
  // any other token: the symbol and decimals it reports about itself
  const ownToken = asset ? undefined : tokenMetadata(summary);

  return (
    <div className="flex flex-col gap-6">
      {/* Identity */}
      <div className="flex items-start gap-4">
        <Identicon
          address={id}
          size={44}
          className="mt-1 shrink-0 rounded-md bg-surface p-1.5"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {asset ? asset.code : isSac ? "Stellar Asset Contract" : "Contract"}
            </h1>
            <Badge
              variant="outline"
              className="border-contract/40 font-mono text-[11px] text-contract"
            >
              {asset ? "Stellar asset contract" : isSac ? "built-in token" : "WASM"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-sm text-dim" title={id}>
              {id}
            </span>
            <CopyButton value={id} label="Copy contract address" />
          </div>
          {asset && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-dim">
              {asset.issuer ? (
                <>
                  issued by <Address address={asset.issuer} />
                </>
              ) : (
                "The network's native asset"
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary facts */}
      <Card className="flex-row flex-wrap gap-x-10 gap-y-4 p-5">
        {summary.executable.kind === "wasm" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-dim">
              WASM hash
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="font-mono text-sm"
                title={summary.executable.wasmHash}
              >
                {truncateKey(summary.executable.wasmHash, 8)}
              </span>
              <CopyButton
                value={summary.executable.wasmHash}
                label="Copy WASM hash"
              />
              <a
                href={`/api/contract/${id}/wasm`}
                download
                className="inline-flex items-center gap-1 rounded-sm text-xs text-dim transition-colors duration-150 hover:text-foreground"
              >
                <Download className="size-3.5" aria-hidden="true" />
                Download
              </a>
            </span>
          </div>
        )}
        {summary.lastModifiedLedger && (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-dim">
              Last modified
            </span>
            <Link
              href={`/ledger/${summary.lastModifiedLedger}`}
              className="font-mono text-sm text-gold hover:underline underline-offset-4"
            >
              ledger {summary.lastModifiedLedger}
            </Link>
          </div>
        )}
        {summary.liveUntilLedger && (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-dim">
              Live until
            </span>
            <span className="font-mono text-sm">
              ledger {summary.liveUntilLedger}
            </span>
          </div>
        )}
        {ownToken && (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-dim">
              Token
            </span>
            <span className="text-sm">
              <span className="font-mono">{ownToken.symbol}</span>
              <span className="text-dim">
                {ownToken.name && ownToken.name !== ownToken.symbol ? ` · ${ownToken.name}` : ""}
                {" · "}
                {ownToken.decimals} decimals · self-reported
              </span>
            </span>
          </div>
        )}
        {creation && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-dim">
                Created
              </span>
              <Link href={`/ledger/${creation.ledger}`} className="rounded-sm text-sm">
                <Time iso={creation.createdAt} className="hover:text-foreground" />
              </Link>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-dim">
                Created by
              </span>
              <Address address={creation.creator} />
            </div>
          </>
        )}
      </Card>

      {/* paging through storage reloads the page, stay on that tab */}
      <Tabs defaultValue={after ? "storage" : "events"}>
        <TabsList>
          <TabsTrigger value="events">Recent events</TabsTrigger>
          <TabsTrigger value="interface">Interface</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <Card id="events" className="scroll-mt-24 gap-4 p-5">
            {events === null ? (
              <EmptyState message="Couldn't load events for this contract. Try again in a moment." />
            ) : events.length === 0 ? (
              <EmptyState message="No recent events. This contract hasn't emitted anything lately." />
            ) : (
              <PagedList topId="events" className="flex flex-col">
                {events.map((event, i) => {
                  const token = describeTokenEvent(
                    { contractId: id, topics: event.topics, data: event.data },
                    network.passphrase,
                  );
                  const when = (
                    <Link
                      href={`/tx/${event.txHash}`}
                      className="shrink-0 rounded-sm"
                      aria-label="View transaction"
                    >
                      <Time iso={event.createdAt} className="hover:text-foreground" />
                    </Link>
                  );
                  return (
                    <div
                      key={`${event.txHash}-${i}`}
                      className="flex flex-col gap-1.5 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
                    >
                      {token ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <TokenEventSentence event={token} info={ownToken} />
                          {when}
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
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
                            {when}
                          </div>
                          <div className="pl-1">
                            <ScValView value={event.data} />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </PagedList>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="interface" className="mt-4">
          <Card className="gap-1 p-5">
            {iface === null || iface.length === 0 ? (
              <EmptyState
                icon={FileCode2}
                message={
                  isSac
                    ? "Stellar Asset Contracts implement the standard token interface (transfer, balance, mint, …), so there's no custom WASM to inspect."
                    : "Couldn't parse an interface from this contract's WASM."
                }
              />
            ) : (
              iface.map((fn, i) => (
                <div key={fn.name}>
                  {i > 0 && <Separator className="my-2.5" />}
                  <code className="block font-mono text-sm leading-6">
                    <span className="text-contract">{fn.name}</span>
                    <span className="text-dim">(</span>
                    {fn.inputs.map((input, j) => (
                      <span key={input.name}>
                        {j > 0 && <span className="text-dim">, </span>}
                        {input.name}
                        <span className="text-dim">: {input.type}</span>
                      </span>
                    ))}
                    <span className="text-dim">)</span>
                    {fn.outputs.length > 0 && (
                      <span className="text-dim"> → {fn.outputs.join(", ")}</span>
                    )}
                  </code>
                </div>
              ))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-4 flex flex-col gap-4">
          {storage && (
            <Card id="entries" className="scroll-mt-24 gap-3 p-5">
              <p className="text-xs uppercase tracking-wider text-dim">
                Persistent and temporary entries
                {(after || storage.next) && (
                  <span className="normal-case tracking-normal">
                    {" "}
                    · {storage.entries.length} at a time
                  </span>
                )}
              </p>
              {storage.entries.length === 0 ? (
                <EmptyState
                  message={
                    after
                      ? "No more entries."
                      : "No entries besides the instance. This contract keeps all its data on its instance entry below."
                  }
                />
              ) : (
                <PagedList topId="entries" className="flex flex-col">
                  {storage.entries.map((entry) => (
                    <div
                      key={entry.keyHash}
                      className="flex flex-col gap-1.5 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StorageKey value={entry.key} />
                        <span className="flex shrink-0 items-center gap-2 text-xs text-dim">
                          {entry.expired ? (
                            <span className="text-fail">expired</span>
                          ) : (
                            entry.liveUntilLedger && (
                              <span className="font-mono">
                                live until {entry.liveUntilLedger}
                              </span>
                            )
                          )}
                          <Badge variant="outline" className="font-mono text-[11px] text-dim">
                            {entry.durability}
                          </Badge>
                        </span>
                      </div>
                      <div className="pl-1">
                        <ScValView value={entry.value} />
                      </div>
                    </div>
                  ))}
                </PagedList>
              )}
              {(after || storage.next) && (
                <nav className="flex items-center justify-end gap-2" aria-label="Storage pages">
                  {after && (
                    <Link href={`/contract/${id}`} className={pageLink}>
                      <ChevronsLeft className="size-3.5" aria-hidden="true" />
                      First
                    </Link>
                  )}
                  {storage.next && (
                    <Link href={`/contract/${id}?after=${storage.next}`} className={pageLink}>
                      Next batch
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </nav>
              )}
            </Card>
          )}
          <Card className="gap-3 p-5">
            <p className="text-xs uppercase tracking-wider text-dim">
              Instance storage
            </p>
            {summary.instanceStorage.length === 0 ? (
              <EmptyState
                message={
                  storage
                    ? "No instance storage. This contract keeps no data on its instance entry."
                    : "No instance storage. This contract keeps no data on its instance entry. Persistent and temporary entries can't be listed on this network yet."
                }
              />
            ) : (
              <div className="flex flex-col gap-2">
                {summary.instanceStorage.map((entry, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-sm text-dim">
                      {entry.key.replace(/^\["([^"]+)"\]$/, "$1")}:
                    </span>
                    <ScValView value={entry.value} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// storage keys are mostly enum variants, a name followed by its fields:
// Balance + holder, Pail + farmer + index. Reads better on one line
function StorageKey({ value }: { value: DecodedValue }) {
  const [name, ...fields] = value.kind === "list" ? value.items : [];
  if (name?.kind !== "scalar" || name.hint !== "string") {
    return (
      <span className="min-w-0 font-mono text-sm text-dim">
        <ScValView value={value} />
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono text-sm text-dim">{name.text}</span>
      {fields.map((field, i) => (
        <ScValView key={i} value={field} />
      ))}
    </span>
  );
}
