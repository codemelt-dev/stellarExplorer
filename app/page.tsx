import { Suspense } from "react";
import { SearchBox } from "@/components/layout/SearchBox";
import { LedgerPulse } from "@/components/live/LedgerPulse";
import { StatsRow } from "@/components/live/StatsRow";
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
    <div className="flex flex-col gap-6">
      <section className="relative flex flex-col items-center gap-6 pt-10 pb-4 sm:pt-14">
        <div className="aurora" aria-hidden="true" />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Your go-to explorer{" "}
            <span className="bg-[linear-gradient(100deg,var(--gold)_20%,#ffe9b8_50%,var(--gold)_80%)] bg-clip-text text-transparent [filter:drop-shadow(0_0_18px_rgba(255,209,102,0.25))]">
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

      <StatsRow />

      <ActivityChart />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <LedgerTicker />
        <LiveOpsFeed />
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
        <DefiSection />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[220px] rounded-lg" />
            <Skeleton className="h-[220px] rounded-lg" />
          </div>
        }
      >
        <NetworkGrowth />
      </Suspense>
    </div>
  );
}
