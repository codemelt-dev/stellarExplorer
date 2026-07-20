import { Card } from "@/components/ui/card";
import { Amount } from "@/components/stellar/Amount";
import { Identicon } from "@/components/stellar/Identicon";
import { EmptyState } from "@/components/states/EmptyState";
import { truncateKey } from "@/lib/stellar/strkey";
import type { Horizon } from "@stellar/stellar-sdk";

type Balance = Horizon.HorizonApi.BalanceLine;

// XLM, then trustlines, then pool shares. Issuer identicons stand in for asset icons
export function BalancesCard({ balances }: { balances: Balance[] }) {
  const native = balances.find((b) => b.asset_type === "native");
  const trustlines = balances.filter(
    (b) => b.asset_type !== "native" && b.asset_type !== "liquidity_pool_shares",
  ) as Extract<Balance, { asset_code: string }>[];
  const poolShares = balances.filter(
    (b) => b.asset_type === "liquidity_pool_shares",
  ) as Extract<Balance, { liquidity_pool_id: string }>[];

  return (
    <Card className="gap-4 p-5">
      <h2 className="text-base font-semibold">Balances</h2>
      {balances.length === 0 ? (
        <EmptyState message="No balances. This account holds no assets." />
      ) : (
        <div className="flex flex-col">
          {native && (
            <BalanceRow
              icon={<span className="size-4 shrink-0 rounded-full bg-gold" />}
              code="XLM"
              detail="native"
              amount={native.balance}
            />
          )}
          {trustlines.map((b) => (
            <BalanceRow
              key={`${b.asset_code}-${b.asset_issuer}`}
              icon={
                <Identicon
                  address={b.asset_issuer}
                  size={16}
                  className="shrink-0 rounded-[3px]"
                />
              }
              code={b.asset_code}
              detail={`issued by ${truncateKey(b.asset_issuer)}`}
              amount={b.balance}
              issuer={b.asset_issuer}
            />
          ))}
          {poolShares.map((b) => (
            <BalanceRow
              key={b.liquidity_pool_id}
              icon={<span className="size-4 shrink-0 rounded-full bg-contract/60" />}
              code="Pool shares"
              detail={truncateKey(b.liquidity_pool_id, 6)}
              amount={b.balance}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function BalanceRow({
  icon,
  code,
  detail,
  amount,
  issuer,
}: {
  icon: React.ReactNode;
  code: string;
  detail: string;
  amount: string;
  issuer?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon}
        <div className="min-w-0">
          <div className="font-mono text-sm">{code}</div>
          <div className="truncate text-xs text-dim">{detail}</div>
        </div>
      </div>
      <Amount amount={amount} assetCode="" assetIssuer={issuer} />
    </div>
  );
}
