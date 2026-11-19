import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function LiquidityPoolsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-[36rem] max-w-full" />
      </div>
      <Card className="gap-0 p-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <Skeleton key={i} className="my-2 h-7 w-full" />
        ))}
      </Card>
    </div>
  );
}
