import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { Address } from "@/components/stellar/Address";
import type { AccountRecord } from "@/lib/stellar/accounts";

function decodeDataValue(b64: string): string {
  try {
    const buf = Buffer.from(b64, "base64");
    const text = buf.toString("utf8");
    // Printable -> show text, otherwise hex
    return /^[\x20-\x7E]*$/.test(text) ? text : `0x${buf.toString("hex")}`;
  } catch {
    return b64;
  }
}

export function DetailsAccordion({ account }: { account: AccountRecord }) {
  const dataEntries = Object.entries(account.data_attr ?? {});
  const flags = Object.entries(account.flags ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => k.replace(/_/g, " "));

  return (
    <Card className="gap-1 p-5 pt-4">
      <h2 className="text-base font-semibold">Details</h2>
      <Accordion type="multiple" className="w-full">
        <AccordionItem value="signers">
          <AccordionTrigger className="text-sm">
            Signers & thresholds
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {account.signers.map((signer) => (
                <div
                  key={signer.key}
                  className="flex items-center justify-between gap-3"
                >
                  {signer.key.startsWith("G") ? (
                    <Address address={signer.key} chars={6} />
                  ) : (
                    <span className="font-mono text-sm break-all">
                      {signer.key}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-xs text-dim">
                    weight {signer.weight}
                  </span>
                </div>
              ))}
            </div>
            <p className="font-mono text-xs text-dim">
              thresholds {account.thresholds.low_threshold}/
              {account.thresholds.med_threshold}/
              {account.thresholds.high_threshold} (low/med/high)
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="flags-seq">
          <AccordionTrigger className="text-sm">
            Flags, sequence & sponsorship
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-1.5 font-mono text-xs">
            <p>
              <span className="text-dim">flags: </span>
              {flags.length ? flags.join(", ") : "none"}
            </p>
            <p>
              <span className="text-dim">sequence: </span>
              {account.sequence}
            </p>
            <p>
              <span className="text-dim">subentries: </span>
              {account.subentry_count}
            </p>
            <p>
              <span className="text-dim">sponsoring: </span>
              {account.num_sponsoring}
              <span className="text-dim"> · sponsored: </span>
              {account.num_sponsored}
            </p>
          </AccordionContent>
        </AccordionItem>

        {dataEntries.length > 0 && (
          <AccordionItem value="data">
            <AccordionTrigger className="text-sm">
              Data entries ({dataEntries.length})
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-1.5">
              {dataEntries.map(([key, value]) => (
                <p key={key} className="font-mono text-xs break-all">
                  <span className="text-dim">{key}: </span>
                  {decodeDataValue(value)}
                </p>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </Card>
  );
}
