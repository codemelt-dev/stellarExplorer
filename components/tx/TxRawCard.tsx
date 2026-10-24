import { Card } from "@/components/ui/card";
import { RawPanel } from "@/components/stellar/RawPanel";
import { truncateKey } from "@/lib/stellar/strkey";
import type { TxRaw } from "@/lib/stellar/transactions";

// the XDR tab: signatures, then the raw envelope, result and meta behind a toggle
export function TxRawCard({ raw }: { raw: TxRaw }) {
  return (
    <Card className="gap-4 p-5">
      <h2 className="text-base font-semibold">
        Signatures ({raw.signatures.length})
      </h2>
      <div className="flex flex-col gap-1">
        {raw.signatures.map((sig, i) => (
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
          { label: "Envelope", value: raw.envelope },
          { label: "Result", value: raw.result },
          { label: "Result meta", value: raw.meta },
        ]}
      />
    </Card>
  );
}
