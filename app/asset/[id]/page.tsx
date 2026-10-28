import type { Metadata } from "next";
import { Suspense } from "react";
import { Coins, Globe, PieChart, SearchX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HolderBubbleMap } from "@/components/asset/HolderBubbleMap";
import { Address } from "@/components/stellar/Address";
import { Amount } from "@/components/stellar/Amount";
import { Identicon } from "@/components/stellar/Identicon";
import { StellarMark } from "@/components/stellar/StellarMark";
import { StatTile } from "@/components/stats/StatTile";
import { PagedList } from "@/components/layout/PagedList";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { getAccount } from "@/lib/stellar/accounts";
import {
  assetContractId,
  getAsset,
  getHolderLinks,
  getTopHolders,
  HOLDER_LINK_DAYS,
  type AssetHolder,
} from "@/lib/stellar/assets";
import type { MapHolder } from "@/lib/stellar/holderMap";
import { parseAssetId, type AssetIdentity } from "@/lib/stellar/assetId";
import { formatAmount, stroopsToLumens } from "@/lib/stellar/amount";
import { getContractSummary } from "@/lib/stellar/contracts";
import { activeNetwork } from "@/lib/stellar/network";
import { fetchTomlOrgInfo } from "@/lib/stellar/toml";
import { NotFoundError } from "@/lib/stellar/transactions";
import { compactNumber } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const identity = parseAssetId(decodeURIComponent(id));
  return { title: `${identity && identity.kind !== "contract" ? identity.code : "Asset"} · Stellar Explorer` };
}

// each lookup is optional decoration: a miss must not take the page down
async function quiet<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch {
    return null;
  }
}

function percent(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  return Number((part * 1_000_000n) / whole) / 10_000;
}

const holderGrid =
  "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_9rem]";

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const network = await activeNetwork();
  const netLabel = network.label.toLowerCase();
  const identity = parseAssetId(decodeURIComponent(id));

  if (!identity || identity.kind === "contract") {
    return (
      <EmptyState
        icon={SearchX}
        message={`"${decodeURIComponent(id).slice(0, 40)}" isn't an asset. Assets are written CODE-ISSUER, for example USDC-GA5Z…KZVN, or XLM.`}
        className="py-24"
      />
    );
  }

  let asset;
  try {
    asset = await getAsset(identity);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <EmptyState
          icon={SearchX}
          message={
            identity.kind === "native"
              ? `Holders and supply of lumens come from the indexer, which covers mainnet only. Switch to Mainnet in the top bar to see them.`
              : `No asset ${identity.code} from this issuer on ${netLabel}. It may live on another network, or nobody holds it yet.`
          }
          className="py-24"
        />
      );
    }
    return (
      <ErrorState
        message="The data source didn't respond while loading this asset. Reload the page to retry."
        className="py-24"
      />
    );
  }

  const contractId = assetContractId(identity, network.passphrase);
  const [holders, issuer, contract] = await Promise.all([
    getTopHolders(identity),
    identity.kind === "issued" ? quiet(getAccount(identity.issuer)) : null,
    contractId ? quiet(getContractSummary(contractId)) : null,
  ]);
  const toml = issuer?.home_domain ? await fetchTomlOrgInfo(issuer.home_domain) : null;

  const supply = BigInt(asset.supply);
  const exactSupply = formatAmount(stroopsToLumens(asset.supply));
  const top10 = holders?.length
    ? percent(
        holders.slice(0, 10).reduce((sum, h) => sum + BigInt(h.balance), 0n),
        supply,
      )
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Identity: which asset this is */}
      <div className="flex items-start gap-4">
        <AssetIcon identity={identity} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{identity.code}</h1>
            <Badge variant="outline" className="font-mono text-[11px] text-dim">
              {identity.kind === "native" ? "native asset" : "issued asset"}
            </Badge>
          </div>
          {identity.kind === "issued" ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-dim">
              {toml?.orgName ? `${toml.orgName}, issued by` : "issued by"}
              <Address address={identity.issuer} chars={8} />
            </div>
          ) : (
            <p className="text-sm text-dim">
              Lumens, the network&apos;s own currency. Pays fees and funds accounts.
            </p>
          )}
          {issuer?.home_domain && (
            <a
              href={`https://${issuer.home_domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-sm text-gold underline-offset-4 hover:underline"
            >
              <Globe className="size-3.5" aria-hidden="true" />
              {issuer.home_domain}
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Holders"
          info="Accounts that hold this asset."
          value={asset.holders.toLocaleString("en-US")}
          icon={Users}
        />
        <StatTile
          label="Supply"
          info="Everything in circulation: in accounts, liquidity pools, contracts and unclaimed balances."
          value={compactNumber(Number(stroopsToLumens(asset.supply)))}
          caption={`${exactSupply.int}${exactSupply.frac ? `.${exactSupply.frac}` : ""} ${identity.code}`}
          icon={Coins}
        />
        <StatTile
          label="Top 10 hold"
          info="Share of the supply held by the ten largest holders. High means concentrated."
          value={top10 === null ? "–" : `${top10.toFixed(1)}%`}
          caption={top10 === null ? "needs the holder ranking" : "of the supply"}
          icon={PieChart}
        />
      </div>

      {contract && contractId && (
        <Card className="flex-row flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
          <span className="text-xs uppercase tracking-wider text-dim">On Soroban</span>
          <Address address={contractId} chars={8} />
          <span className="text-dim">the contract smart contracts use to move this asset</span>
        </Card>
      )}

      {holders && holders.length > 1 && (
        <section id="holder-map" className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="text-lg font-semibold">Holder map</h2>
          <Card className="p-4 sm:p-5">
            <Suspense fallback={<HolderMapSkeleton />}>
              <HolderMap identity={identity} holders={holders} supply={supply} />
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
                <span className="hidden text-right sm:block">Share</span>
              </div>
              <PagedList topId="holders" className="flex flex-col">
                {holders.map((holder) => (
                  <HolderRow key={holder.rank} holder={holder} supply={supply} code={identity.code} />
                ))}
              </PagedList>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}

// waits on the transfers between holders, a few seconds on the busiest assets
async function HolderMap({
  identity,
  holders,
  supply,
}: {
  identity: AssetIdentity & { kind: "native" | "issued" };
  holders: AssetHolder[];
  supply: bigint;
}) {
  const shown = holders.slice(0, 100);
  const links = await getHolderLinks(identity, shown.map((h) => h.holder));
  const issuer = identity.kind === "issued" ? identity.issuer : null;
  const mapHolders: MapHolder[] = shown.map((h) => ({
    rank: h.rank,
    holder: h.holder,
    balance: h.balance,
    share: percent(BigInt(h.balance), supply),
    label: h.holder === issuer ? "issuer" : h.holder.startsWith("C") ? "contract" : undefined,
  }));
  return (
    <HolderBubbleMap holders={mapHolders} links={links} code={identity.code} days={HOLDER_LINK_DAYS} />
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

function AssetIcon({ identity }: { identity: AssetIdentity }) {
  if (identity.kind === "issued") {
    return (
      <Identicon
        address={identity.issuer}
        size={44}
        className="mt-1 shrink-0 rounded-md bg-surface p-1.5"
      />
    );
  }
  return (
    <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-md bg-surface">
      <StellarMark className="size-6" />
    </span>
  );
}

function HolderRow({
  holder,
  supply,
  code,
}: {
  holder: AssetHolder;
  supply: bigint;
  code: string;
}) {
  const share = percent(BigInt(holder.balance), supply);
  return (
    <div className={`${holderGrid} h-11 border-b border-border last:border-b-0`}>
      <span className="text-sm text-dim tabular-nums">{holder.rank}</span>
      <span className="min-w-0 truncate">
        <Address address={holder.holder} chars={6} />
      </span>
      <span className="text-right">
        <Amount amount={stroopsToLumens(holder.balance)} assetCode={code} maxDecimals={2} />
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
