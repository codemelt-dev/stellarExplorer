import type { Metadata } from "next";
import { Coins } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssetLabel } from "@/components/stellar/AssetLabel";
import { ClickableRow } from "@/components/stellar/ClickableRow";
import { TokenAmount } from "@/components/stellar/TokenAmount";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Pager } from "@/components/layout/Pager";
import { listHeadClass } from "@/components/layout/listTable";
import { SearchBox } from "@/components/layout/SearchBox";
import { getAssetDirectory, type AssetSummary } from "@/lib/stellar/assets";
import { assetHref, assetKey } from "@/lib/stellar/assetId";
import { formatAmount, stroopsToLumens } from "@/lib/stellar/amount";
import { activeNetwork } from "@/lib/stellar/network";
import { compactNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Assets · Stellar Explorer" };

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const network = await activeNetwork();

  let page;
  try {
    page = await getAssetDirectory(cursor);
  } catch {
    return (
      <ErrorState
        message="The indexer didn't respond while loading assets. Reload the page to retry."
        className="py-24"
      />
    );
  }

  if (!page) {
    return (
      <EmptyState
        icon={Coins}
        message={`The asset ranking is built by the indexer, which covers mainnet only. Switch to Mainnet in the top bar, or search an asset by its code on ${network.label.toLowerCase()}.`}
        action={<SearchBox className="w-full max-w-md" />}
        className="py-24"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Assets</h1>
        <p className="text-sm text-dim">
          Every asset on {network.label.toLowerCase()}, ranked by how many accounts hold it.
          Refreshed once a day.
        </p>
      </div>

      <Card className="gap-0 p-0">
        {page.rows.length === 0 ? (
          <EmptyState message="No assets on this page. Go back to the top of the ranking." />
        ) : (
          <Table>
            <TableHeader className={listHeadClass}>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14 pl-4">#</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Holders</TableHead>
                <TableHead className="pr-4 text-right">Supply</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((asset, i) => (
                <ClickableRow
                  key={assetKey(asset.identity)}
                  href={assetHref(asset.identity)}
                  label="Open asset"
                  className="border-b border-border last:border-b-0"
                >
                  <TableCell className="pl-4 text-dim tabular-nums">
                    {page.firstRank + i}
                  </TableCell>
                  <TableCell>
                    <AssetLabel identity={asset.identity} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {asset.holders.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Supply asset={asset} />
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Pager
        basePath="/assets"
        olderCursor={page.nextCursor}
        isFirstPage={!cursor}
        firstLabel="Top"
        nextLabel="Next"
      />
    </div>
  );
}

// rounded for scanning, the exact figure on hover. A Soroban-only token has
// no known decimals here, so its supply stays in base units
function Supply({ asset }: { asset: AssetSummary }) {
  if (asset.identity.kind === "contract") {
    return <TokenAmount amount={asset.supply} token={asset.identity.contractId} />;
  }
  const exact = stroopsToLumens(asset.supply);
  const { int, frac } = formatAmount(exact);
  return (
    <span
      className="font-mono text-sm whitespace-nowrap"
      title={`${int}${frac ? `.${frac}` : ""} ${asset.identity.code}`}
    >
      {compactNumber(Number(exact))} <span className="text-dim">{asset.identity.code}</span>
    </span>
  );
}
