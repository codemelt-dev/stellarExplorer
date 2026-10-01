import type { Metadata } from "next";
import { Clock, SearchX, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TxAction } from "@/components/tx/TxAction";
import { StatusPill } from "@/components/tx/StatusPill";
import { DetailGroup, DetailList, DetailRow } from "@/components/tx/DetailList";
import { FlowTarget } from "@/components/tx/FlowTarget";
import { OpSentence } from "@/components/stellar/OpSentence";
import { OpCard } from "@/components/tx/OpCard";
import { Address } from "@/components/stellar/Address";
import { Time } from "@/components/stellar/Time";
import { Amount } from "@/components/stellar/Amount";
import { RawPanel } from "@/components/stellar/RawPanel";
import { ContractEvents } from "@/components/tx/ContractEvents";
import { CopyButton } from "@/components/stellar/CopyButton";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { truncateKey } from "@/lib/stellar/strkey";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { activeNetwork } from "@/lib/stellar/network";
import {
  envelopeFlow,
  getTransaction,
  getTransactionEffects,
  getTransactionOperations,
  NotFoundError,
} from "@/lib/stellar/transactions";
import {
  decodeTxError,
  getSorobanEvents,
  getSorobanReturnValue,
  memoDisplay,
  parsePreconditions,
  parseSorobanInvocation,
  parseSorobanResources,
  sorobanTokenMovements,
} from "@/lib/stellar/xdrDecode";
import { BalanceChanges } from "@/components/tx/BalanceChanges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTransactionMetaXdr } from "@/lib/stellar/rpc";
import { getContractInterface } from "@/lib/stellar/contracts";
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
  const netLabel = (await activeNetwork()).label.toLowerCase();

  let tx;
  let ops;
  let effects;
  try {
    [tx, ops, effects] = await Promise.all([
      getTransaction(hash),
      getTransactionOperations(hash),
      getTransactionEffects(hash),
    ]);
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
        message="Horizon didn't respond while loading this transaction."
        className="py-24"
      />
    );
  }

  const record = tx as typeof tx & Record<string, unknown>;
  const error = tx.successful ? null : decodeTxError(tx.result_xdr);
  // Horizon no longer returns result_meta_xdr - fall back to Stellar RPC
  // (only worth the round-trip for Soroban txs).
  const hasSorobanOp = ops.some(
    (op) => (op.type as string) === "invoke_host_function",
  );
  const resultMetaXdr =
    (record["result_meta_xdr"] as string | undefined) ??
    (hasSorobanOp ? ((await getTransactionMetaXdr(tx.hash)) ?? undefined) : undefined);
  const returnValue = getSorobanReturnValue(resultMetaXdr);
  const events = getSorobanEvents(resultMetaXdr);
  const tokenMovements = sorobanTokenMovements(events);
  const memo = memoDisplay(tx.memo_type, tx.memo);
  const feeBump = record["fee_bump_transaction"] as
    | { hash: string }
    | undefined;
  const innerTx = record["inner_transaction"] as
    | { hash: string; max_fee: string }
    | undefined;
  const feeAccount = (record["fee_account"] as string | undefined) ?? tx.source_account;

  // one-liner under the verdict: what this tx did
  const invocations = ops
    .map((op, i) =>
      (op.type as string) === "invoke_host_function"
        ? parseSorobanInvocation(tx.envelope_xdr, i)
        : null,
    )
    .filter(Boolean);
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
  const flow = envelopeFlow(tx.envelope_xdr, tx.source_account);
  const utc = (iso: string) => iso.replace("T", " ").replace(/(\.\d+)?Z$/, " UTC");

  const typeChip = txTypeLabel(ops.map((op) => op.type as string));
  const resources = hasSorobanOp ? parseSorobanResources(tx.envelope_xdr) : null;
  const preconditions = parsePreconditions(tx.envelope_xdr);

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
                href={`/ledger/${tx.ledger_attr}`}
                className="rounded-sm font-mono text-gold underline-offset-4 hover:underline"
              >
                {tx.ledger_attr.toLocaleString("en-US")}
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
              <Time iso={tx.created_at} className="text-foreground" />
              <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-dim">
                {utc(new Date(tx.created_at).toISOString())}
              </span>
            </span>
          </DetailRow>
        </DetailGroup>

        <DetailGroup>
          <DetailRow label="From" help="The account that signed and submitted this transaction. Its sequence number was used.">
            <Address address={tx.source_account} chars={40} />
          </DetailRow>
          <DetailRow label="To / interacted with" help="Who or what the main operation targets: the recipient, the contract called, the asset pair traded or the asset trusted.">
            <FlowTarget target={flow.to} moreOps={0} full />
          </DetailRow>
          {feeBump && innerTx && (
            <>
              <DetailRow label="Fee paid by" help="Someone else paid the fee for this transaction (a fee bump). Wallets use this to cover their users' fees.">
                <Address address={feeAccount} chars={40} />
              </DetailRow>
              <DetailRow label="Inner transaction" help="The original transaction wrapped by the fee bump.">
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-mono" title={innerTx.hash}>
                    {truncateKey(innerTx.hash, 10)}
                  </span>
                  <CopyButton value={innerTx.hash} label="Copy inner transaction hash" />
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
              <Amount amount={stroopsToLumens(tx.fee_charged)} />
              <span className="text-xs text-dim">
                max {stroopsToLumens(tx.max_fee)} XLM offered
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
            <span className="font-mono">{tx.source_account_sequence}</span>
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
          <DetailRow label="Signatures" help="How many keys signed. The raw signatures are on the XDR tab.">
            {tx.signatures.length}
          </DetailRow>
        </DetailGroup>
      </DetailList>

      {/* Operations - the reading layer */}
      <section id="operations" className="flex scroll-mt-24 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {ops.length} operation{ops.length === 1 ? "" : "s"}
          </h2>
          {ops.length > 3 && (
            <nav
              className="flex max-w-full flex-wrap gap-1"
              aria-label="Jump to operation"
            >
              {ops.map((_, i) => (
                <a
                  key={i}
                  href={`#op-${i + 1}`}
                  className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-dim transition-colors duration-150 hover:text-foreground"
                >
                  {i + 1}
                </a>
              ))}
            </nav>
          )}
        </div>
        {ops.length === 0 ? (
          <Card className="p-0">
            <EmptyState message="Horizon returned no operations for this transaction." />
          </Card>
        ) : (
          ops.map((op, i) => {
            const invocation = parseSorobanInvocation(tx.envelope_xdr, i);
            return (
              <OpCard
                key={op.id}
                index={i}
                record={op}
                invocation={invocation}
                argNames={argNamesFor(invocation)}
                returnValue={
                  (op.type as string) === "invoke_host_function"
                    ? returnValue
                    : null
                }
              />
            );
          })
        )}
      </section>

      {/* Contract events */}
      {events.length > 0 && <ContractEvents events={events} />}
        </TabsContent>

        <TabsContent value="balances">
          <BalanceChanges
            effects={effects}
            sorobanMovements={tokenMovements}
            feeCharged={String(tx.fee_charged)}
            feeAccount={feeAccount}
            successful={tx.successful}
          />
        </TabsContent>

        <TabsContent value="raw">
          <Card className="gap-4 p-5">
            <h2 className="text-base font-semibold">
              Signatures ({tx.signatures.length})
            </h2>
            <div className="flex flex-col gap-1">
              {tx.signatures.map((sig, i) => (
                <span
                  key={i}
                  className="font-mono text-xs text-dim break-all"
                  title={sig}
                >
                  {truncateKey(sig, 12)}
                </span>
              ))}
            </div>
            <RawPanel
              label="Raw XDR"
              entries={[
                { label: "Envelope", value: tx.envelope_xdr },
                { label: "Result", value: tx.result_xdr },
                { label: "Result meta", value: resultMetaXdr ?? "" },
              ]}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
