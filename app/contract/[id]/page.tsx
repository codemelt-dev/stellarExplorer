import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, FileCode2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Identicon } from "@/components/stellar/Identicon";
import { CopyButton } from "@/components/stellar/CopyButton";
import { ScValView } from "@/components/stellar/ScValView";
import { Time } from "@/components/stellar/Time";
import { EmptyState } from "@/components/states/EmptyState";
import { activeNetwork } from "@/lib/stellar/network";
import {
  getContractEvents,
  getContractInterface,
  getContractSummary,
} from "@/lib/stellar/contracts";
import { truncateKey } from "@/lib/stellar/strkey";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Contract ${truncateKey(id, 6)} · Stellar Explorer` };
}

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const netLabel = (await activeNetwork()).label.toLowerCase();

  const [summary, iface, events] = await Promise.all([
    getContractSummary(id),
    getContractInterface(id),
    getContractEvents(id),
  ]);

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
              {isSac ? "Stellar Asset Contract" : "Contract"}
            </h1>
            <Badge
              variant="outline"
              className="border-contract/40 font-mono text-[11px] text-contract"
            >
              {isSac ? "built-in token" : "WASM"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-sm text-dim" title={id}>
              {id}
            </span>
            <CopyButton value={id} label="Copy contract address" />
          </div>
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
      </Card>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Recent events</TabsTrigger>
          <TabsTrigger value="interface">Interface</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <Card className="gap-4 p-5">
            {events === null ? (
              <EmptyState message="Couldn't reach Stellar RPC for events. Try again in a moment." />
            ) : events.length === 0 ? (
              <EmptyState message="No events in the recent ledger window. This contract hasn't emitted anything lately. Full history needs an indexer (roadmap)." />
            ) : (
              <div className="flex flex-col">
                {events.map((event, i) => (
                  <div
                    key={`${event.txHash}-${i}`}
                    className="flex flex-col gap-1.5 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
                  >
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
                      <Link
                        href={`/tx/${event.txHash}`}
                        className="shrink-0 rounded-sm"
                        aria-label="View transaction"
                      >
                        <Time
                          iso={event.createdAt}
                          className="hover:text-foreground"
                        />
                      </Link>
                    </div>
                    <div className="pl-1">
                      <ScValView value={event.data} />
                    </div>
                  </div>
                ))}
              </div>
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

        <TabsContent value="storage" className="mt-4">
          <Card className="gap-3 p-5">
            <p className="text-xs uppercase tracking-wider text-dim">
              Instance storage
            </p>
            {summary.instanceStorage.length === 0 ? (
              <EmptyState message="No instance storage. This contract keeps no data on its instance entry. Persistent/temporary entries need known keys (indexer on the roadmap)." />
            ) : (
              <div className="flex flex-col gap-2">
                {summary.instanceStorage.map((entry, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-sm text-dim">
                      {entry.key}:
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
