import { Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DecodedTxError } from "@/lib/stellar/xdrDecode";
import { cn } from "@/lib/utils";

// top card: what this transaction did, in one decoded sentence. Failures say why
export function TxAction({
  successful,
  error,
  children,
}: {
  successful: boolean;
  error: DecodedTxError | null;
  children: React.ReactNode;
}) {
  const reason = error
    ? error.operationCodes.length > 0
      ? error.operationCodes.join(" · ")
      : error.transactionCode
    : null;
  return (
    <Card
      className={cn(
        "flex-row items-start gap-4 p-5",
        !successful && "border-fail/30 bg-fail/5 ring-fail/30",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full border",
          successful ? "border-border bg-surface-2 text-gold" : "border-fail/30 bg-fail/10 text-fail",
        )}
      >
        <Zap className="size-4.5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wider text-dim">Transaction action</span>
        <div className="min-w-0 text-[15px]">{children}</div>
        {!successful && (
          <p className="text-sm text-fail">
            Failed{reason ? `: ${reason}` : ""}. The fee was still charged.
          </p>
        )}
      </div>
    </Card>
  );
}
