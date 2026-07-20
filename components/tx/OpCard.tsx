import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OpSentence } from "@/components/stellar/OpSentence";
import { ScValView } from "@/components/stellar/ScValView";
import { RawPanel } from "@/components/stellar/RawPanel";
import { Address } from "@/components/stellar/Address";
import { humanizeOperation } from "@/lib/stellar/humanize";
import type { OperationRecord } from "@/lib/stellar/transactions";
import type { DecodedValue, SorobanInvocation } from "@/lib/stellar/xdrDecode";
import { cn } from "@/lib/utils";

// one op per card: sentence first, decoded soroban details, raw at the bottom
export function OpCard({
  index,
  record,
  invocation,
  returnValue,
  argNames,
}: {
  index: number;
  record: OperationRecord;
  invocation: SorobanInvocation | null;
  returnValue: DecodedValue | null;
  /** Parameter names from the contract's WASM spec, when it resolves. */
  argNames?: string[] | null;
}) {
  const segments = humanizeOperation(record);
  const isSoroban = (record.type as string) === "invoke_host_function";

  return (
    <Card
      id={`op-${index + 1}`}
      className={cn(
        "scroll-mt-20 gap-3 p-5",
        isSoroban && "border-l-2 border-l-contract",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-dim select-none">
            #{index + 1}
          </span>
          <div className="text-sm">
            {invocation?.kind === "invokeContract" && invocation.contractId ? (
              <span className="leading-7">
                <OpSentence segments={segments.slice(0, 1)} />
                <span> invoked </span>
                <span className="font-mono text-sm text-contract">
                  {invocation.functionName}
                </span>
                <span> on </span>
                <Address address={invocation.contractId} />
              </span>
            ) : (
              <OpSentence segments={segments} />
            )}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 font-mono text-[11px] text-dim",
            isSoroban && "border-contract/40 text-contract",
          )}
        >
          {(record.type as string).replace(/_/g, " ")}
        </Badge>
      </div>

      {invocation && invocation.args.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md bg-surface-2/60 p-3">
          <span className="text-xs uppercase tracking-wider text-dim">
            Arguments
          </span>
          {invocation.args.map((arg, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono text-xs text-dim">
                {argNames?.[i] ? `${argNames[i]}:` : i}
              </span>
              <ScValView value={arg} />
            </div>
          ))}
        </div>
      )}

      {returnValue && (
        <div className="flex flex-col gap-1.5 rounded-md bg-surface-2/60 p-3">
          <span className="text-xs uppercase tracking-wider text-dim">
            Returned
          </span>
          <ScValView value={returnValue} />
        </div>
      )}

      <RawPanel
        entries={[
          {
            label: "Operation record (Horizon JSON)",
            value: JSON.stringify(record, null, 2),
          },
        ]}
      />
    </Card>
  );
}
