import { Info, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// the one tile template: label + info, big number, caption, icon chip
export function StatTile({
  label,
  info,
  value,
  caption,
  icon: Icon,
  className,
}: {
  label: string;
  info?: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "tile flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1 text-xs text-dim">
          <span className="truncate">{label}</span>
          {info && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-sm text-dim/70 transition-colors hover:text-foreground"
                  aria-label={`About ${label}`}
                >
                  <Info className="size-3" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-60">{info}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
          {value}
        </span>
        {caption && (
          <span className="truncate text-xs text-dim tabular-nums">{caption}</span>
        )}
      </div>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-dim">
        <Icon className="size-4" aria-hidden="true" />
      </span>
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="size-8 rounded-md" />
    </div>
  );
}
