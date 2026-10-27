import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function LedgerLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Skeleton className="h-[52px] flex-1 rounded-lg sm:w-36 sm:flex-none" />
          <Skeleton className="h-[52px] flex-1 rounded-lg sm:w-36 sm:flex-none" />
        </div>
      </div>
      <Card className="flex-row flex-wrap gap-x-10 gap-y-4 p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </Card>
      <Skeleton className="h-6 w-36" />
      <Card className="gap-0 p-5 py-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="my-2 h-6 w-full" />
        ))}
      </Card>
    </div>
  );
}
