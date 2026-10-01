import { ArrowRight } from "lucide-react";
import { Address } from "@/components/stellar/Address";
import type { AssetRef, TxTarget } from "@/lib/stellar/txFlow";

function AssetCode({ asset }: { asset: AssetRef }) {
  return (
    <span className="font-mono text-sm" title={asset.issuer ? `${asset.code} issued by ${asset.issuer}` : "Stellar Lumens"}>
      {asset.code}
    </span>
  );
}

// the "to" side of a transaction row: payee, contract call, offer pair or trustline
export function FlowTarget({
  target,
  moreOps,
  full = false,
}: {
  target: TxTarget | null;
  moreOps: number;
  /** Detail pages: whole address with copy. Lists keep it short. */
  full?: boolean;
}) {
  return (
    <span className={full ? "inline-flex flex-wrap items-center gap-2" : "inline-flex items-center gap-2 whitespace-nowrap"}>
      {target === null ? (
        <span className="text-dim">–</span>
      ) : target.kind === "address" ? (
        <>
          <Address address={target.address} copy={full} chars={full ? 40 : 4} />
          {target.call && (
            <span
              className={full ? "rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-contract" : "max-w-36 truncate font-mono text-xs text-dim"}
              title={`${target.call}()`}
            >
              {target.call}()
            </span>
          )}
        </>
      ) : target.kind === "pair" ? (
        <span className="inline-flex items-center gap-1.5">
          <AssetCode asset={target.from} />
          <ArrowRight className="size-3 text-dim" aria-label="for" />
          <AssetCode asset={target.to} />
        </span>
      ) : target.kind === "asset" ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-dim">Trustline</span>
          <AssetCode asset={target.asset} />
        </span>
      ) : (
        <span className="text-dim">{target.text}</span>
      )}
      {moreOps > 0 && (
        <span
          className="rounded-md border border-border px-1.5 py-px text-[11px] tabular-nums text-dim"
          title={`${moreOps} more operation${moreOps > 1 ? "s" : ""} in this transaction`}
        >
          +{moreOps}
        </span>
      )}
    </span>
  );
}
