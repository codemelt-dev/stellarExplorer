import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function AccountLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex items-start gap-4">
        <Skeleton className="size-[52px] rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-96 max-w-[70vw]" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="gap-4 p-5">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card>
        <Card className="gap-4 p-5">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
      <Card className="gap-4 p-5">
        <Skeleton className="h-5 w-20" />
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </Card>
    </div>
  );
}
