import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HolderBubbleMap } from "@/components/asset/HolderBubbleMap";
import { Address } from "@/components/stellar/Address";
import { Amount } from "@/components/stellar/Amount";
import { PagedList } from "@/components/layout/PagedList";
import { EmptyState } from "@/components/states/EmptyState";
import { getHolderLinks, HOLDER_LINK_DAYS, type AssetHolder } from "@/lib/stellar/assets";
import type { AssetIdentity } from "@/lib/stellar/assetId";
import type { MapHolder } from "@/lib/stellar/holderMap";
import { unitsToDecimal } from "@/lib/stellar/amount";

/** Percent of the supply, null when the supply isn't known. */
export function percent(part: bigint, whole: bigint | null): number | null {
  if (whole === null || whole <= 0n) return null;
  return Number((part * 1_000_000n) / whole) / 10_000;
}

const holderGrid =
  "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_9rem]";

// the holder map and the ranked list, for a classic asset or a Soroban token
export function HolderSections({
  identity,
  holders,
  supply,
  code,
  decimals,
  issuer = null,
  netLabel,
}: {
  identity: AssetIdentity;
  holders: AssetHolder[] | null;
  /** Null hides the shares, for tokens whose supply we can't count. */
  supply: bigint | null;
  code: string;
  decimals: number;
  issuer?: string | null;
  netLabel: string;
}) {
  return (
    <>
      {holders && holders.length > 1 && (
        <section id="holder-map" className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="text-lg font-semibold">Holder map</h2>
          <Card className="p-4 sm:p-5">
            <Suspense fallback={<HolderMapSkeleton />}>
              <HolderMap
                identity={identity}
                holders={holders}
                supply={supply}
                code={code}
                decimals={decimals}
                issuer={issuer}
              />
            </Suspense>
          </Card>
        </section>
      )}

      <section id="holders" className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="text-lg font-semibold">Top holders</h2>
        <Card className="gap-3 p-5">
          {holders === null ? (
            <EmptyState
              message={`The holder ranking is built by the indexer, which covers mainnet only. It isn't available on ${netLabel}.`}
            />
          ) : holders.length === 0 ? (
            <EmptyState message="No holders ranked yet. The ranking is rebuilt once a day." />
          ) : (
            <>
              <div
                className={`${holderGrid} border-b border-border pb-2 text-xs font-medium uppercase tracking-wider text-dim`}
              >
                <span>#</span>
                <span>Holder</span>
                <span className="text-right">Balance</span>
                <span className="hidden text-right sm:block">{supply === null ? "" : "Share"}</span>
              </div>
              <PagedList topId="holders" className="flex flex-col">
                {holders.map((holder) => (
                  <HolderRow
                    key={holder.rank}
                    holder={holder}
                    supply={supply}
                    code={code}
                    decimals={decimals}
                  />
                ))}
              </PagedList>
            </>
          )}
        </Card>
      </section>
    </>
  );
}

// waits on the transfers between holders, a few seconds on the busiest assets
async function HolderMap({
  identity,
  holders,
  supply,
  code,
  decimals,
  issuer,
}: {
  identity: AssetIdentity;
  holders: AssetHolder[];
  supply: bigint | null;
  code: string;
  decimals: number;
  issuer: string | null;
}) {
  const shown = holders.slice(0, 100);
  const links = await getHolderLinks(identity, shown.map((h) => h.holder));
  const mapHolders: MapHolder[] = shown.map((h) => ({
    rank: h.rank,
    holder: h.holder,
    balance: h.balance,
    share: percent(BigInt(h.balance), supply),
    label: h.holder === issuer ? "issuer" : h.holder.startsWith("C") ? "contract" : undefined,
  }));
  return (
    <HolderBubbleMap
      holders={mapHolders}
      links={links}
      code={code}
      decimals={decimals}
      days={HOLDER_LINK_DAYS}
    />
  );
}

function HolderMapSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <Skeleton className="aspect-square w-full rounded-lg" />
      <Skeleton className="h-[26rem] w-full rounded-lg lg:h-auto" />
    </div>
  );
}

function HolderRow({
  holder,
  supply,
  code,
  decimals,
}: {
  holder: AssetHolder;
  supply: bigint | null;
  code: string;
  decimals: number;
}) {
  const share = percent(BigInt(holder.balance), supply);
  return (
    <div className={`${holderGrid} h-11 border-b border-border last:border-b-0`}>
      <span className="text-sm text-dim tabular-nums">{holder.rank}</span>
      <span className="min-w-0 truncate">
        <Address address={holder.holder} chars={6} />
      </span>
      <span className="text-right">
        <Amount amount={unitsToDecimal(holder.balance, decimals)} assetCode={code} maxDecimals={2} />
      </span>
      <span className="hidden items-center justify-end gap-2 sm:flex">
        {share !== null && (
          <>
            <span className="h-1 w-14 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-dim"
                style={{ width: `${Math.min(share, 100)}%` }}
              />
            </span>
            <span className="w-14 text-right font-mono text-xs tabular-nums">
              {share < 0.01 ? "<0.01" : share.toFixed(2)}%
            </span>
          </>
        )}
      </span>
    </div>
  );
}
