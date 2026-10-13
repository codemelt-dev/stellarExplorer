import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function ContractsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-64 rounded-lg" />
      <Card className="gap-0 p-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <Skeleton key={i} className="my-2 h-7 w-full" />
        ))}
      </Card>
    </div>
  );
}
