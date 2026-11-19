import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function DefiLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-[36rem] max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-6 w-32" />
      <Card className="gap-0 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="my-2 h-8 w-full" />
        ))}
      </Card>
    </div>
  );
}
