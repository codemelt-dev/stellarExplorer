import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function PoolLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-6 w-28" />
      <Card className="gap-0 p-5 py-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="my-3 h-6 w-full" />
        ))}
      </Card>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-[180px] w-full rounded-lg" />
    </div>
  );
}
