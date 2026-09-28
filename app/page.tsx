import { Suspense } from "react";
import { SearchBox } from "@/components/layout/SearchBox";
import { LedgerPulse } from "@/components/live/LedgerPulse";
import { StatsRow } from "@/components/live/StatsRow";
import { StatsRowServer } from "@/components/live/StatsRowServer";
import { ActivityChart } from "@/components/live/ActivityChart";
import { LedgerTicker } from "@/components/live/LedgerTicker";
import { LiveOpsFeed } from "@/components/live/LiveOpsFeed";
import { DefiSection } from "@/components/defi/DefiSection";
import { NetworkGrowth } from "@/components/defi/NetworkGrowth";
import { Skeleton } from "@/components/ui/skeleton";

// DeFi data revalidates on this cadence; live data streams client-side anyway
export const revalidate = 900;

export default function Home() {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col items-center gap-5 pt-6 pb-2 sm:pt-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Your go-to explorer{" "}
            <span className="text-gold">
              on Stellar
            </span>
          </h1>
          <p className="max-w-md text-sm text-dim sm:text-base">
            Live every five seconds. Decoded by default, raw on demand.
          </p>
        </div>
        <LedgerPulse />
        <SearchBox large className="w-full max-w-xl" />
      </section>

      <Suspense fallback={<StatsRow />}>
        <StatsRowServer />
      </Suspense>

      <ActivityChart />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section id="ledgers" className="flex scroll-mt-20 flex-col *:flex-1">
          <LedgerTicker />
        </section>
        <section id="operations" className="flex scroll-mt-20 flex-col *:flex-1">
          <LiveOpsFeed />
        </section>
      </div>

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-[220px] w-full rounded-lg" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-[320px] rounded-lg" />
              <Skeleton className="h-[320px] rounded-lg" />
            </div>
          </div>
        }
      >
        <section id="defi" className="scroll-mt-20">
          <DefiSection />
        </section>
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[220px] rounded-lg" />
            <Skeleton className="h-[220px] rounded-lg" />
          </div>
        }
      >
        <section id="network" className="scroll-mt-20">
          <NetworkGrowth />
        </section>
      </Suspense>
    </div>
  );
}
