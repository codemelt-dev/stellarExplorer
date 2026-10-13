import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function AssetLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex items-start gap-4">
        <Skeleton className="size-11 rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Card className="gap-0 p-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="my-2 h-7 w-full" />
        ))}
      </Card>
    </div>
  );
}
