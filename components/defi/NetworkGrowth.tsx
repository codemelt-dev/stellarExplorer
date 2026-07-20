import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/EmptyState";
import { VolumeChart } from "./VolumeChart";
import { getNetworkGrowth } from "@/lib/stellar/networkStats";

export async function NetworkGrowth() {
  const growth = await getNetworkGrowth();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">Network growth</h2>
        <Badge variant="outline" className="text-dim">
          mainnet
        </Badge>
        <span className="ml-auto text-xs text-dim">data: stellar.expert</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="tile gap-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold">New accounts per day</h3>
            {growth && (
              <span className="text-xs uppercase tracking-wider text-dim">
                last {growth.newAccounts.length} days
              </span>
            )}
          </div>
          {growth ? (
            <VolumeChart points={growth.newAccounts} unit="count" />
          ) : (
            <EmptyState message="Couldn't reach stellar.expert. Growth data will be back on the next refresh." />
          )}
        </Card>

        <Card className="tile gap-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold">New assets per day</h3>
            {growth && (
              <span className="text-xs uppercase tracking-wider text-dim">
                last {growth.newAssets.length} days
              </span>
            )}
          </div>
          {growth ? (
            <VolumeChart points={growth.newAssets} unit="count" />
          ) : (
            <EmptyState message="Couldn't reach stellar.expert. Growth data will be back on the next refresh." />
          )}
        </Card>
      </div>
    </section>
  );
}
