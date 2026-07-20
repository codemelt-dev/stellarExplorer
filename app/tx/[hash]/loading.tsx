import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Skeletons match the final layout - no spinners for page loads. */
export default function TransactionLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-[72px] w-full rounded-lg" />
      <Card className="flex-row flex-wrap gap-x-10 gap-y-4 p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </Card>
      <Skeleton className="h-6 w-36" />
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="gap-3 p-5">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-16 w-full" />
        </Card>
      ))}
    </div>
  );
}
