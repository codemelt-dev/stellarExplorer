import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function AssetsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Card className="gap-0 p-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <Skeleton key={i} className="my-2 h-7 w-full" />
        ))}
      </Card>
    </div>
  );
}
