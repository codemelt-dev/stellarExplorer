import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function SearchLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-12 w-full max-w-xl rounded-md" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-48" />
        <Card className="gap-0 p-5 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="my-2.5 h-6 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
