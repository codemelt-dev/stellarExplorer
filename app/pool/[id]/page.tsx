import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  Coins,
  Droplets,
  SearchX,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Address } from "@/components/stellar/Address";
import { Amount } from "@/components/stellar/Amount";
import { AssetLabel } from "@/components/stellar/AssetLabel";
import { CopyButton } from "@/components/stellar/CopyButton";
import { StatTile } from "@/components/stats/StatTile";
import { PagedList } from "@/components/layout/PagedList";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { VolumeChart } from "@/components/defi/VolumeChart";
import { PROTOCOL_LABEL, PoolPair, assetCodeOf } from "@/components/pool/PoolPair";
import { PoolActivityRow } from "@/components/pool/PoolActivityRow";
import { assetKey, type AssetIdentity } from "@/lib/stellar/assetId";
import { indexerActive } from "@/lib/stellar/indexer/client";
import { activeNetwork } from "@/lib/stellar/network";
import { getPool, poolIdOf, type PoolDetail, type PoolKind } from "@/lib/stellar/pools";
import { truncateKey } from "@/lib/stellar/strkey";
import { compactNumber, compactUsd } from "@/lib/format";

const usd = (n: number | null) => (n === null ? "–" : n < 1 ? "<$1" : compactUsd(n));
const issuerOf = (identity: AssetIdentity) => (identity.kind === "issued" ? identity.issuer : undefined);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const poolId = poolIdOf(id);
  const pool = poolId ? await getPool(poolId) : null;
  const name =
    pool && pool !== "missing"
      ? `${assetCodeOf(pool.a.identity)} / ${assetCodeOf(pool.b.identity)} pool`
      : "Liquidity pool";
  return { title: `${name} · Stellar Explorer` };
}

export default async function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const poolId = poolIdOf(id);
  if (!poolId) {
    return (
      <EmptyState
        icon={SearchX}
        message={`"${decodeURIComponent(id).slice(0, 70)}" isn't a pool id. Pools are a 64-character hex id or an L… address, Soroban pools a C… contract address.`}
        className="py-24"
      />
    );
  }

  const [pool, active, network] = await Promise.all([getPool(poolId), indexerActive(), activeNetwork()]);
  if (pool === "missing") {
    return (
      <EmptyState
        icon={SearchX}
        message={
          poolId.startsWith("C")
            ? "This contract isn't a Soroswap or Aquarius pool that traded in the last 30 days. Open it as a contract instead."
            : "No liquidity pool with this id on mainnet. It may never have existed, or every share was withdrawn and it was removed."
        }
        className="py-24"
        action={
          poolId.startsWith("C") && (
            <Link href={`/contract/${poolId}`} className="rounded-sm text-sm text-gold hover:underline">
              Open the contract
            </Link>
          )
        }
      />
    );
  }
  if (!pool) {
    return active ? (
      <ErrorState
        message="The indexer didn't respond while loading this pool. Reload the page to retry."
        className="py-24"
      />
    ) : (
      <EmptyState
        icon={Droplets}
        message={`Pool pages come from the indexer, which covers mainnet only. Switch to Mainnet in the top bar to see this pool; it isn't available on ${network.label.toLowerCase()}.`}
        className="py-24"
      />
    );
  }

  const codeA = assetCodeOf(pool.a.identity);
  const codeB = assetCodeOf(pool.b.identity);
  const fee = pool.feeBp === null ? null : `${(pool.feeBp / 100).toFixed(2)}%`;
  const valuedBy =
    pool.valuedBy === assetKey(pool.a.identity) ? codeA : pool.valuedBy === assetKey(pool.b.identity) ? codeB : null;
  const soroban = pool.protocol !== "classic";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <nav aria-label="Breadcrumb" className="text-sm text-dim">
          <Link href="/liquidity-pools" className="rounded-sm hover:text-foreground">
            Liquidity pools
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-foreground">
            {codeA} / {codeB}
          </span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            <PoolPair a={pool.a.identity} b={pool.b.identity} size={28} />
          </h1>
          <Badge variant="outline" className="font-mono text-[11px] text-dim">
            {kindOf(pool, fee)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dim">
          {soroban ? (
            <span className="inline-flex items-center gap-1.5">
              Contract <Address address={pool.address} chars={6} />
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                Pool id
                <span className="font-mono text-foreground" title={pool.id}>
                  {truncateKey(pool.id, 8)}
                </span>
                <CopyButton value={pool.id} label="Copy pool id" />
              </span>
              <span className="inline-flex items-center gap-1.5">
                Address <Address address={pool.address} chars={6} link={false} />
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="TVL"
          info={tvlInfo(pool)}
          value={usd(pool.tvlUsd)}
          caption={
            valuedBy
              ? `valued by its ${valuedBy} side`
              : soroban
                ? "no side we can price and confirm"
                : "neither side has a reliable price"
          }
          icon={Droplets}
        />
        <StatTile
          label="Volume 24h"
          info="Trades routed through this pool over the last 17,280 ledgers (about a day), valued at today's prices."
          value={pool.trades24h ? usd(pool.volume24hUsd) : "$0"}
          caption={`${pool.trades24h.toLocaleString("en-US")} trade${pool.trades24h === 1 ? "" : "s"}`}
          icon={TrendingUp}
        />
        <StatTile
          label="Fees 24h"
          info={
            fee === null
              ? "Aquarius sets a fee per pool. This one hasn't had a trade to read it from in the last 30 days."
              : soroban
                ? `Every trade pays the pool ${fee}.`
                : `Every trade pays the pool ${fee}, which stays in the reserves and accrues to share holders.`
          }
          value={fee === null ? "–" : pool.trades24h ? usd(pool.fees24hUsd) : "$0"}
          caption={fee === null ? "fee not known yet" : soroban ? `${fee} of volume` : `${fee} of volume, to liquidity providers`}
          icon={Coins}
        />
        {pool.accounts !== null && pool.shares !== null ? (
          <StatTile
            label="LP accounts"
            info="Accounts with a trustline to the pool's shares."
            value={pool.accounts.toLocaleString("en-US")}
            caption={`${compactNumber(pool.shares)} pool shares`}
            icon={Users}
          />
        ) : (
          <StatTile
            label="Protocol"
            info="A Soroban contract. Its reserves come from its own events, its trades and liquidity from the token transfers it made."
            value={PROTOCOL_LABEL[pool.protocol]}
            caption={pool.kind ? `${KIND_LABEL[pool.kind]} pool` : "pool contract"}
            icon={Boxes}
          />
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Reserves</h2>
        <Card className="gap-0 p-5 py-2">
          {[pool.a, pool.b].map((side) => (
            <div
              key={side.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_7rem]"
            >
              <AssetLabel identity={side.identity} />
              <Amount
                amount={side.exact}
                assetCode={assetCodeOf(side.identity)}
                assetIssuer={issuerOf(side.identity)}
                maxDecimals={2}
                className="text-right"
              />
              <span className="col-span-2 text-right font-mono text-sm text-dim tabular-nums sm:col-span-1">
                {side.usd === null ? "no price" : usd(side.usd)}
              </span>
            </div>
          ))}
          {pool.price !== null && pool.price > 0 && (
            <p className="py-3 font-mono text-xs text-dim">
              1 {codeA} = {price(pool.price)} {codeB}
              <span aria-hidden="true"> · </span>1 {codeB} = {price(1 / pool.price)} {codeA}
              {pool.kind === "concentrated" && <span className="font-sans"> at the pool&apos;s current tick</span>}
              {pool.kind === "stable" && <span className="font-sans"> at its latest trade</span>}
            </p>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Daily volume</h2>
        <Card className="gap-3 p-5">
          {pool.daily.length ? (
            <>
              <VolumeChart points={pool.daily} />
              <p className="text-xs text-dim">
                Trades through the pool per UTC day over the last 30 days, valued at today&apos;s
                prices.
              </p>
            </>
          ) : (
            <EmptyState message="No trades through this pool in the last 30 days." />
          )}
        </Card>
      </section>

      <section id="activity" className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="text-lg font-semibold">Latest activity</h2>
        <Card className="gap-3 p-5 py-4">
          {pool.activity.length ? (
            <PagedList topId="activity" className="flex flex-col">
              {pool.activity.map((a, i) => (
                <PoolActivityRow key={`${a.txHash}-${i}`} activity={a} />
              ))}
            </PagedList>
          ) : (
            <EmptyState message="No trades, deposits or withdrawals indexed for this pool yet." />
          )}
        </Card>
      </section>
    </div>
  );
}

const KIND_LABEL: Record<PoolKind, string> = {
  constant_product: "constant product",
  stable: "stable",
  concentrated: "concentrated liquidity",
};

function kindOf(pool: PoolDetail, fee: string | null): string {
  return [
    pool.protocol === "classic" ? null : PROTOCOL_LABEL[pool.protocol],
    pool.kind && KIND_LABEL[pool.kind],
    fee && `${fee} fee`,
  ]
    .filter(Boolean)
    .join(", ");
}

function tvlInfo(pool: PoolDetail): string {
  if (pool.protocol === "classic") {
    return "Value locked: both sides of a pool are worth the same at its own price, so twice its XLM, USDC or deeply priced side, at prices from our own pools.";
  }
  const held = " That side has to be held for real in the latest daily balances, not just claimed in events.";
  return pool.kind === "concentrated" || pool.kind === "stable"
    ? `Value locked from the pool's latest reserves: its XLM, USDC or deeply priced side at prices from our own pools, the other side at the pool's own price but never above the first.${held}`
    : `Value locked from the pool's latest reserves: twice its XLM, USDC or deeply priced side, at prices from our own pools.${held}`;
}

function price(n: number): string {
  if (!Number.isFinite(n)) return "–";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toPrecision(4);
}
