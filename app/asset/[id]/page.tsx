import type { Metadata } from "next";
import { Coins, DollarSign, Globe, PieChart, SearchX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HolderSections, percent } from "@/components/asset/HolderSections";
import { Address } from "@/components/stellar/Address";
import { Identicon } from "@/components/stellar/Identicon";
import { StellarMark } from "@/components/stellar/StellarMark";
import { StatTile } from "@/components/stats/StatTile";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { getAccount } from "@/lib/stellar/accounts";
import { assetContractId, getAsset, getTopHolders } from "@/lib/stellar/assets";
import { parseAssetId, type AssetIdentity } from "@/lib/stellar/assetId";
import { formatAmount, stroopsToLumens } from "@/lib/stellar/amount";
import { getContractSummary } from "@/lib/stellar/contracts";
import { activeNetwork } from "@/lib/stellar/network";
import { fetchTomlOrgInfo } from "@/lib/stellar/toml";
import { NotFoundError } from "@/lib/stellar/transactions";
import { compactNumber, formatPrice } from "@/lib/format";
import { getAssetPrice, type AssetPrice } from "@/lib/stellar/pricing";

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

function xlmAmount(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toPrecision(4);
}

function priceValue(price: AssetPrice | null, code: string): string {
  if (!price) return "–";
  if (price.usd !== null) return formatPrice(price.usd);
  return code === "XLM" ? "–" : `${xlmAmount(price.xlm)} XLM`;
}

function priceCaption(price: AssetPrice | null, native: boolean, netLabel: string): string {
  if (!price) return netLabel === "mainnet" ? "no pool or order book prices it" : "mainnet only";
  const depth = price.depthXlm === null ? "" : `${compactNumber(price.depthXlm)} XLM`;
  if (native) return `from the XLM / USDC pool of ${depth}`;
  const xlm = `${xlmAmount(price.xlm)} XLM`;
  if (price.source === "xlm pool") return `${xlm} in a pool of ${depth}`;
  if (price.source === "usdc pool") return `${xlm}, from a USDC pool of ${depth}`;
  return `${xlm}, order book mid`;
}

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
  const [holders, issuer, contract, price] = await Promise.all([
    getTopHolders(identity),
    identity.kind === "issued" ? quiet(getAccount(identity.issuer)) : null,
    contractId ? quiet(getContractSummary(contractId)) : null,
    getAssetPrice(identity),
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Price"
          info="From our own liquidity pools: the deepest pool against XLM (or Circle USDC), with XLM priced from the XLM / USDC pool. Pools holding under 1,000 XLM aren't used; without one, the order book's mid price."
          value={priceValue(price, identity.code)}
          caption={priceCaption(price, identity.kind === "native", netLabel)}
          icon={DollarSign}
        />
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

      <HolderSections
        identity={identity}
        holders={holders}
        supply={supply}
        code={identity.code}
        decimals={7}
        issuer={identity.kind === "issued" ? identity.issuer : null}
        netLabel={netLabel}
      />
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
