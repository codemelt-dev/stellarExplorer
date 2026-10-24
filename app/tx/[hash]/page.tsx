import type { Metadata } from "next";
import { Clock, SearchX, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TxAction } from "@/components/tx/TxAction";
import { StatusPill } from "@/components/tx/StatusPill";
import { DetailGroup, DetailList, DetailRow } from "@/components/tx/DetailList";
import { FlowTarget } from "@/components/tx/FlowTarget";
import { OpSentence } from "@/components/stellar/OpSentence";
import { OpCard } from "@/components/tx/OpCard";
import { OpJump } from "@/components/tx/OpJump";
import { PagedList } from "@/components/layout/PagedList";
import { Address } from "@/components/stellar/Address";
import { Time } from "@/components/stellar/Time";
import { Amount } from "@/components/stellar/Amount";
import { TxRawCard } from "@/components/tx/TxRawCard";
import { RawXdr } from "@/components/tx/RawXdr";
import { ContractEvents } from "@/components/tx/ContractEvents";
import { CopyButton } from "@/components/stellar/CopyButton";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { truncateKey } from "@/lib/stellar/strkey";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { activeNetwork } from "@/lib/stellar/network";
import { getTransactionDetail, NotFoundError } from "@/lib/stellar/transactions";
import { BalanceChanges } from "@/components/tx/BalanceChanges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getContractInterface, getTokenInfo } from "@/lib/stellar/contracts";
import { humanizeOperation, txTypeLabel } from "@/lib/stellar/humanize";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hash: string }>;
}): Promise<Metadata> {
  const { hash } = await params;
  return { title: `Tx ${truncateKey(hash, 6)} · Stellar Explorer` };
}

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const network = await activeNetwork();
  const netLabel = network.label.toLowerCase();

  let tx;
  try {
    tx = await getTransactionDetail(hash);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <EmptyState
          icon={SearchX}
          message={`No transaction with hash ${truncateKey(hash, 8)} on ${netLabel}. It may be on another network, or the hash may be mistyped.`}
          className="py-24"
        />
      );
    }
    return (
      <ErrorState
        message="The network didn't respond while loading this transaction."
        className="py-24"
      />
    );
  }

  const { ops, events, error, memo, feeEvents, flow, resources, preconditions } = tx;
  // tokens that aren't Stellar assets: ask each contract for its symbol and decimals
  const otherTokens = [...new Set(tx.movements.filter((m) => !m.asset).map((m) => m.token))];
  const tokens = Object.fromEntries(
    await Promise.all(
      otherTokens.slice(0, 8).map(async (id) => [id, await getTokenInfo(id)] as const),
    ),
  );

  // one-liner under the verdict: what this tx did
  const invocations = tx.invocations.filter(Boolean);
  const firstInvocation = invocations[0];
  const firstOp = ops[0];
  const moreOps = ops.length - 1;
  // same sentence as the first op card, so the top line and the list agree
  const action = firstOp ? (
    <span className="leading-7">
      {firstInvocation?.kind === "invokeContract" && firstInvocation.contractId ? (
        <>
          <OpSentence segments={humanizeOperation(firstOp).slice(0, 1)} /> called{" "}
          <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-sm text-contract">
            {firstInvocation.functionName}
          </span>{" "}
          on <Address address={firstInvocation.contractId} />
        </>
      ) : (
        <OpSentence segments={humanizeOperation(firstOp)} />
      )}
      {moreOps > 0 && (
        <a href="#operations" className="ml-2 rounded-sm text-sm text-dim underline-offset-4 hover:text-foreground hover:underline">
          +{moreOps} more operation{moreOps === 1 ? "" : "s"}
        </a>
      )}
    </span>
  ) : (
    <span className="text-dim">No operations</span>
  );
  const utc = (iso: string) => iso.replace("T", " ").replace(/(\.\d+)?Z$/, " UTC");

  const typeChip = txTypeLabel(ops.map((op) => op.type as string));

  // argument names come from each contract's WASM spec, when it resolves
  const ifaceByContract = new Map<
    string,
    Awaited<ReturnType<typeof getContractInterface>>
  >();
  for (const inv of invocations) {
    if (inv?.contractId && !ifaceByContract.has(inv.contractId)) {
      ifaceByContract.set(inv.contractId, await getContractInterface(inv.contractId));
    }
  }
  function argNamesFor(inv: (typeof invocations)[number]): string[] | null {
    if (!inv?.contractId || !inv.functionName) return null;
    const fn = ifaceByContract
      .get(inv.contractId)
      ?.find((f) => f.name === inv.functionName);
    if (!fn || fn.inputs.length !== inv.args.length) return null;
    return fn.inputs.map((input) => input.name);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Transaction details</h1>
          <StatusPill successful={tx.successful} />
        </div>
        {typeChip && (
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-[11px]",
              typeChip.tone === "contract" ? "border-contract/40 text-contract" : "text-dim",
            )}
          >
            {typeChip.label}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="balances">Effects</TabsTrigger>
          <TabsTrigger value="raw">XDR</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
      <TxAction successful={tx.successful} error={error}>
        {action}
      </TxAction>

      <DetailList>
        <DetailGroup>
          <DetailRow label="Transaction hash" help="Unique ID of this transaction. Share it to point anyone at exactly this transaction.">
            <span className="inline-flex max-w-full items-center gap-1.5">
              <span className="font-mono break-all">{tx.hash}</span>
              <CopyButton value={tx.hash} label="Copy transaction hash" />
            </span>
          </DetailRow>
          <DetailRow label="Status" help="Whether the network applied this transaction. Failed transactions change nothing but still pay the fee.">
            <StatusPill successful={tx.successful} />
          </DetailRow>
          <DetailRow label="Ledger" help="The ledger (Stellar's block) that included this transaction. Ledgers are final the moment they close, there are no confirmations to wait for.">
            <span className="inline-flex flex-wrap items-center gap-2">
              <Link
                href={`/ledger/${tx.ledger}`}
                className="rounded-sm font-mono text-gold underline-offset-4 hover:underline"
              >
                {tx.ledger.toLocaleString("en-US")}
              </Link>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-dim">
                <ShieldCheck className="size-3.5 text-ok" aria-hidden="true" />
                Final
              </span>
            </span>
          </DetailRow>
          <DetailRow label="Timestamp" help="When the ledger closed. Relative time first, exact UTC time next to it.">
            <span className="inline-flex flex-wrap items-center gap-2">
              <Clock className="size-3.5 text-dim" aria-hidden="true" />
              <Time iso={tx.createdAt} className="text-foreground" />
              <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-dim">
                {utc(new Date(tx.createdAt).toISOString())}
              </span>
            </span>
          </DetailRow>
        </DetailGroup>

        <DetailGroup>
          <DetailRow label="From" help="The account that signed and submitted this transaction. Its sequence number was used.">
            <Address address={tx.sourceAccount} chars={40} />
          </DetailRow>
          <DetailRow label="To / interacted with" help="Who or what the main operation targets: the recipient, the contract called, the asset pair traded or the asset trusted.">
            <FlowTarget target={flow.to} moreOps={0} full />
          </DetailRow>
          {tx.innerHash && (
            <>
              <DetailRow label="Fee paid by" help="Someone else paid the fee for this transaction (a fee bump). Wallets use this to cover their users' fees.">
                <Address address={tx.feeAccount} chars={40} />
              </DetailRow>
              <DetailRow label="Inner transaction" help="The original transaction wrapped by the fee bump.">
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-mono" title={tx.innerHash}>
                    {truncateKey(tx.innerHash, 10)}
                  </span>
                  <CopyButton value={tx.innerHash} label="Copy inner transaction hash" />
                </span>
              </DetailRow>
            </>
          )}
        </DetailGroup>

        <DetailGroup>
          {flow.amount && (
            <DetailRow label="Value" help="Amount moved by the main operation, at full precision.">
              <Amount
                amount={flow.amount.value}
                assetCode={flow.amount.asset.code}
                assetIssuer={flow.amount.asset.issuer}
              />
            </DetailRow>
          )}
          <DetailRow label="Transaction fee" help="What was actually charged. Senders set a maximum; Stellar only charges what the ledger needed.">
            <span className="inline-flex flex-wrap items-baseline gap-x-3">
              <Amount amount={stroopsToLumens(tx.feeCharged)} />
              <span className="text-xs text-dim">
                max {stroopsToLumens(tx.maxFee)} XLM offered
                {feeEvents && feeEvents.refunded !== "0" && (
                  <> · {stroopsToLumens(feeEvents.refunded)} XLM refunded</>
                )}
              </span>
            </span>
          </DetailRow>
          {resources && (
            <DetailRow label="Contract resources" help="Compute and storage the contract call used. The resource fee is part of the transaction fee.">
              <span className="inline-flex flex-wrap gap-2 font-mono text-xs">
                {[
                  [resources.instructions.toLocaleString("en-US"), "instructions"],
                  [resources.readBytes.toLocaleString("en-US"), "bytes read"],
                  [resources.writeBytes.toLocaleString("en-US"), "bytes written"],
                  [`${stroopsToLumens(resources.resourceFeeStroops)} XLM`, "resource fee"],
                ].map(([value, label]) => (
                  <span key={label} className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5">
                    {value} <span className="text-dim">{label}</span>
                  </span>
                ))}
              </span>
            </DetailRow>
          )}
        </DetailGroup>

        <DetailGroup>
          {memo && (
            <DetailRow label={memo.label} help="Free-form note attached by the sender. Exchanges often use it to route deposits.">
              <span className="font-mono break-all">{memo.text}</span>
            </DetailRow>
          )}
          <DetailRow label="Operations" help="Steps inside this transaction. They all succeed together or none of them apply.">
            <a href="#operations" className="rounded-sm underline-offset-4 hover:underline">
              {ops.length}
            </a>
          </DetailRow>
          <DetailRow label="Sequence number" help="Per-account counter that orders transactions and stops replays.">
            <span className="font-mono">{tx.sequence}</span>
          </DetailRow>
          {preconditions && (preconditions.minTime || preconditions.maxTime) && (
            <DetailRow label="Valid" help="Time window the sender allowed this transaction to be included in.">
              <span className="font-mono text-xs text-dim">
                {preconditions.minTime
                  ? `from ${utc(new Date(Number(preconditions.minTime) * 1000).toISOString())} `
                  : ""}
                {preconditions.maxTime
                  ? `until ${utc(new Date(Number(preconditions.maxTime) * 1000).toISOString())}`
                  : ""}
              </span>
            </DetailRow>
          )}
          {tx.raw && (
            <DetailRow label="Signatures" help="How many keys signed. The raw signatures are on the XDR tab.">
              {tx.raw.signatures.length}
            </DetailRow>
          )}
        </DetailGroup>
      </DetailList>

      {/* Operations - the reading layer */}
      <section id="operations" className="flex scroll-mt-24 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {ops.length} operation{ops.length === 1 ? "" : "s"}
          </h2>
          {ops.length > 3 && <OpJump count={ops.length} />}
        </div>
        {ops.length === 0 ? (
          <Card className="p-0">
            <EmptyState message="No operations recorded for this transaction." />
          </Card>
        ) : (
          <PagedList anchorPrefix="op-" topId="operations" className="flex flex-col gap-3">
            {ops.map((op, i) => (
              <OpCard
                key={op.id}
                index={i}
                record={op}
                invocation={tx.invocations[i]}
                argNames={argNamesFor(tx.invocations[i])}
                returnValue={tx.returnValues[i]}
              />
            ))}
          </PagedList>
        )}
      </section>

      {/* Contract events */}
      {events.length > 0 && (
        <ContractEvents events={events} passphrase={network.passphrase} tokens={tokens} />
      )}
        </TabsContent>

        <TabsContent value="balances">
          <BalanceChanges
            effects={tx.effects}
            movements={tx.movements}
            notes={tx.notes}
            tokens={tokens}
            feeCharged={tx.feeCharged}
            feeAccount={tx.feeAccount}
            successful={tx.successful}
          />
        </TabsContent>

        <TabsContent value="raw">
          {tx.raw ? <TxRawCard raw={tx.raw} /> : <RawXdr hash={tx.hash} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
