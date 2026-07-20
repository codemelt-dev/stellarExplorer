import { CheckCircle2, XCircle } from "lucide-react";
import type { DecodedTxError } from "@/lib/stellar/xdrDecode";
import { cn } from "@/lib/utils";

// the primary fact of the page: did it confirm
export function VerdictBanner({
  successful,
  error,
  summary,
}: {
  successful: boolean;
  error: DecodedTxError | null;
  /** One-line "what this tx did" under the verdict. */
  summary?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-4 sm:p-5",
        successful
          ? "border-ok/30 bg-ok/5 shadow-[0_0_44px_-14px_rgba(74,222,128,0.35)]"
          : "border-fail/30 bg-fail/5 shadow-[0_0_44px_-14px_rgba(248,113,113,0.35)]",
      )}
    >
      {successful ? (
        <CheckCircle2 className="size-7 shrink-0 text-ok" aria-hidden="true" />
      ) : (
        <XCircle className="size-7 shrink-0 text-fail" aria-hidden="true" />
      )}
      <div>
        <div
          className={cn(
            "text-xl font-semibold",
            successful ? "text-ok" : "text-fail",
          )}
        >
          {successful ? "Success" : "Failed"}
        </div>
        {!successful && error && (
          <p className="mt-0.5 text-sm text-dim">
            {error.operationCodes.length > 0
              ? error.operationCodes.join(" · ")
              : error.transactionCode}
          </p>
        )}
        {summary && <p className="mt-0.5 text-sm text-dim">{summary}</p>}
      </div>
    </div>
  );
}
