import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Address } from "@/components/stellar/Address";
import { EmptyState } from "@/components/states/EmptyState";
import { SearchBox } from "@/components/layout/SearchBox";
import { searchAssetsByCode } from "@/lib/stellar/assets";
import { resolveQuery } from "@/lib/stellar/resolveQuery";

export const metadata: Metadata = { title: "Search · Stellar Explorer" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const resolved = resolveQuery(q);

  const assets =
    resolved.type === "asset" ? await searchAssetsByCode(resolved.code) : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Search</h1>
      <SearchBox large className="max-w-xl" />

      {resolved.type === "asset" && assets.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">
            Assets matching <span className="font-mono">{resolved.code}</span>
          </h2>
          <Card className="gap-0 p-5 py-2">
            {assets.map((asset) => (
              <div
                key={`${asset.asset_code}-${asset.asset_issuer}`}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{asset.asset_code}</span>
                  <Address address={asset.asset_issuer} chars={6} />
                </div>
                <span className="font-mono text-xs text-dim">
                  {asset.accounts.authorized.toLocaleString("en-US")} holders
                </span>
              </div>
            ))}
          </Card>
          <p className="text-xs text-dim">
            Issuer links open the issuing account. Dedicated asset pages are on
            the roadmap.
          </p>
        </section>
      ) : q ? (
        <EmptyState
          icon={SearchX}
          message={`Nothing matches "${q}". Try a full address (G…/C…/M…), a 64-character transaction hash, a ledger number, an asset code, or name*domain.com.`}
          className="py-16"
        />
      ) : (
        <EmptyState
          message="Paste anything: an account, a contract, a transaction hash, a ledger number, an asset code."
          className="py-16"
        />
      )}

      {resolved.type === "federation" && (
        <EmptyState
          message={`Federation lookups (${q}) aren't wired up yet. Resolving via SEP-2 is on the roadmap. Paste the account address directly for now.`}
        />
      )}
      <p className="text-center">
        <Link href="/" className="text-sm text-gold hover:underline underline-offset-4">
          ← Back to the pulse
        </Link>
      </p>
    </div>
  );
}
