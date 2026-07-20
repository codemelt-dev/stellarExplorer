import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { VerdictBanner } from "@/components/tx/VerdictBanner";
import { OpCard } from "@/components/tx/OpCard";
import { Address } from "@/components/stellar/Address";
import { Time } from "@/components/stellar/Time";
import { Amount } from "@/components/stellar/Amount";
import { RawPanel } from "@/components/stellar/RawPanel";
import { ScValView } from "@/components/stellar/ScValView";
import { CopyButton } from "@/components/stellar/CopyButton";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { truncateKey } from "@/lib/stellar/strkey";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { activeNetwork } from "@/lib/stellar/network";
import {
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
} from "@/lib/stellar/xdrDecode";
import { BalanceChanges } from "@/components/tx/BalanceChanges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTransactionMetaXdr } from "@/lib/stellar/rpc";
import { getContractInterface } from "@/lib/stellar/contracts";
import { txTypeLabel } from "@/lib/stellar/humanize";
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
  const summary =
    firstInvocation?.kind === "invokeContract" && firstInvocation.contractId ? (
      <>
        Invoked{" "}
        <span className="font-mono text-contract">
          {firstInvocation.functionName}
        </span>{" "}
        on <Address address={firstInvocation.contractId} />
        {invocations.length > 1 && ` +${invocations.length - 1} more`}
      </>
    ) : undefined;

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
      {/* Identity row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Transaction</h1>
        {typeChip && (
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-[11px]",
              typeChip.tone === "contract"
                ? "border-contract/40 text-contract"
                : "text-dim",
            )}
          >
            {typeChip.label}
          </Badge>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-sm text-dim" title={tx.hash}>
            {truncateKey(tx.hash, 8)}
          </span>
          <CopyButton value={tx.hash} label="Copy transaction hash" />
        </span>
      </div>

      <VerdictBanner successful={tx.successful} error={error} summary={summary} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Summary</TabsTrigger>
          <TabsTrigger value="balances">Effects</TabsTrigger>
          <TabsTrigger value="raw">XDR</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 flex flex-col gap-6">
      {/* label/value rows: scannable facts */}
      <Card className="gap-0 p-5 py-2">
        <KVRow label="Hash">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-sm" title={tx.hash}>
              {tx.hash}
            </span>
            <CopyButton value={tx.hash} label="Copy transaction hash" />
          </span>
        </KVRow>
        <KVRow label="Ledger">
          <Link
            href={`/ledger/${tx.ledger_attr}`}
            className="font-mono text-sm text-gold hover:underline underline-offset-4"
          >
            {tx.ledger_attr}
          </Link>
        </KVRow>
        <KVRow label="Time">
          <span className="inline-flex flex-wrap items-baseline gap-x-3">
            <Time iso={tx.created_at} className="text-foreground" />
            <span className="font-mono text-xs text-dim">
              {new Date(tx.created_at)
                .toISOString()
                .replace("T", " ")
                .replace(/\.\d+Z$/, " UTC")}
            </span>
          </span>
        </KVRow>
        <KVRow label="Source">
          <Address address={tx.source_account} chars={8} />
        </KVRow>
        <KVRow label="Fee">
          <span className="inline-flex flex-wrap items-baseline gap-x-3">
            <Amount amount={stroopsToLumens(tx.fee_charged)} />
            <span className="font-mono text-xs text-dim">
              max {stroopsToLumens(tx.max_fee)} proposed
            </span>
          </span>
        </KVRow>
        {memo && (
          <KVRow label={memo.label}>
            <span className="font-mono text-sm break-all">{memo.text}</span>
          </KVRow>
        )}
        <KVRow label="Sequence">
          <span className="font-mono text-sm">{tx.source_account_sequence}</span>
        </KVRow>
        {resources && (
          <KVRow label="Resources">
            <span className="inline-flex flex-wrap gap-x-4 font-mono text-sm">
              <span>
                {resources.instructions.toLocaleString("en-US")}
                <span className="text-dim"> instr</span>
              </span>
              <span>
                {resources.readBytes.toLocaleString("en-US")}
                <span className="text-dim"> B read</span>
              </span>
              <span>
                {resources.writeBytes.toLocaleString("en-US")}
                <span className="text-dim"> B written</span>
              </span>
              <span className="text-dim">
                resource fee {stroopsToLumens(resources.resourceFeeStroops)} XLM
              </span>
            </span>
          </KVRow>
        )}
        {preconditions && (
          <KVRow label="Valid">
            <span className="font-mono text-xs text-dim">
              {preconditions.minTime
                ? `from ${new Date(Number(preconditions.minTime) * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC `
                : ""}
              {preconditions.maxTime
                ? `until ${new Date(Number(preconditions.maxTime) * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC`
                : ""}
            </span>
          </KVRow>
        )}
      </Card>

      {feeBump && innerTx && (
        <Card className="gap-2 border-l-2 border-l-gold p-5">
          <span className="text-xs uppercase tracking-wider text-dim">
            Fee-bump transaction
          </span>
          <p className="text-sm">
            Fees paid by <Address address={feeAccount} /> on behalf of inner
            transaction{" "}
            <span className="font-mono text-sm" title={innerTx.hash}>
              {truncateKey(innerTx.hash, 6)}
            </span>
            <CopyButton value={innerTx.hash} label="Copy inner hash" className="ml-1" />
          </p>
        </Card>
      )}

      {/* Operations - the reading layer */}
      <section className="flex flex-col gap-3">
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
      {events.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {events.length} contract event{events.length === 1 ? "" : "s"}
          </h2>
          <Card className="gap-4 p-5">
            {events.map((event, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                {i > 0 && <Separator className="mb-2" />}
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
              </div>
            ))}
          </Card>
        </section>
      )}
        </TabsContent>

        <TabsContent value="balances" className="mt-4">
          <BalanceChanges
            effects={effects}
            feeCharged={String(tx.fee_charged)}
            feeAccount={feeAccount}
            successful={tx.successful}
          />
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
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

/** Label column left (fixed, dim), value right - the readable KV grammar. */
function KVRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-36 shrink-0 text-xs uppercase tracking-wider text-dim">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
