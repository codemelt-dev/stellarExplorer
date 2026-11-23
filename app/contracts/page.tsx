import type { Metadata } from "next";
import Link from "next/link";
import { Activity, FileCode2, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Address } from "@/components/stellar/Address";
import { AssetLabel } from "@/components/stellar/AssetLabel";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Pager } from "@/components/layout/Pager";
import { SegmentedLinks } from "@/components/layout/SegmentedLinks";
import { TypeTabs, type TypeTab } from "@/components/layout/TypeTabs";
import { listHeadClass } from "@/components/layout/listTable";
import { getContractDirectory } from "@/lib/stellar/contracts";
import { activeNetwork } from "@/lib/stellar/network";
import { truncateKey } from "@/lib/stellar/strkey";

export const metadata: Metadata = { title: "Contracts · Stellar Explorer" };

type View = "active" | "all";

// how far back the most active ranking counts
const PERIODS = [
  { id: "24h", label: "24h", days: 1, href: "/contracts", words: "24 hours" },
  { id: "7d", label: "7d", days: 7, href: "/contracts?period=7d", words: "7 days" },
];

const TABS: TypeTab<View>[] = [
  { id: "active", label: "Most active", icon: Activity },
  { id: "all", label: "All contracts", icon: List },
];

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; cursor?: string; period?: string }>;
}) {
  const { type, cursor, period: periodParam } = await searchParams;
  const view: View = type === "all" ? "all" : "active";
  const period = PERIODS.find((p) => p.id === periodParam) ?? PERIODS[0];
  const network = await activeNetwork();
  const netLabel = network.label.toLowerCase();

  let page;
  let failed = false;
  try {
    page = await getContractDirectory(view, cursor, period.days);
  } catch {
    failed = true;
  }

  if (page === null) {
    return (
      <EmptyState
        icon={FileCode2}
        message={`Listing contracts needs the indexer, which covers mainnet only. Switch to Mainnet in the top bar, or open a contract on ${netLabel} by pasting its address in the search.`}
        className="py-24"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
        <p className="text-sm text-dim">
          {view === "active"
            ? `The contracts called most on ${netLabel} over the last ${period.words}.`
            : `Every contract on ${netLabel}, in address order.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TypeTabs tabs={TABS} active={view} basePath="/contracts" label="Contract list" />
        {view === "active" && <SegmentedLinks label="Period" options={PERIODS} value={period.id} />}
      </div>

      <Card className="gap-0 p-0">
        {failed || !page ? (
          <ErrorState
            message={
              view === "active"
                ? "The indexer couldn't rank contracts by activity just now. Reload to retry, or open the full list."
                : "The indexer didn't respond while loading contracts. Reload the page to retry."
            }
          />
        ) : page.rows.length === 0 ? (
          <EmptyState
            message={
              view === "active"
                ? `No contract calls in the last ${period.words}.`
                : "No contracts on this page. Go back to the start of the list."
            }
          />
        ) : (
          <Table>
            <TableHeader className={listHeadClass}>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Contract</TableHead>
                <TableHead>What it is</TableHead>
                {view === "active" && (
                  <TableHead className="pr-4 text-right">Calls, {period.label}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((c) => (
                <ClickableRow
                  key={c.contractId}
                  href={`/contract/${c.contractId}`}
                  label="Open contract"
                  className="border-b border-border last:border-b-0"
                >
                  <TableCell className="pl-4">
                    <Address address={c.contractId} chars={8} copy={false} />
                  </TableCell>
                  <TableCell>
                    {c.asset ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <AssetLabel identity={c.asset} />
                        <Badge variant="outline" className="font-mono text-[11px] text-dim">
                          asset contract
                        </Badge>
                      </span>
                    ) : c.wasmHash ? (
                      <span className="inline-flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-contract/40 font-mono text-[11px] text-contract"
                        >
                          WASM
                        </Badge>
                        <span className="font-mono text-xs text-dim" title={c.wasmHash}>
                          {truncateKey(c.wasmHash, 8)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-dim">–</span>
                    )}
                  </TableCell>
                  {view === "active" && (
                    <TableCell className="pr-4 text-right tabular-nums">
                      {c.calls?.toLocaleString("en-US") ?? "–"}
                    </TableCell>
                  )}
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {view === "all" && page && (
        <Pager
          basePath="/contracts"
          olderCursor={page.nextCursor}
          isFirstPage={!cursor}
          query={{ type: "all" }}
          firstLabel="Start"
          nextLabel="Next"
        />
      )}
      {view === "active" && !failed && (
        <p className="text-xs text-dim">
          Showing the top {page?.rows.length ?? 0}.{" "}
          <Link href="/contracts?type=all" className="text-gold underline-offset-4 hover:underline">
            See every contract
          </Link>
        </p>
      )}
    </div>
  );
}
