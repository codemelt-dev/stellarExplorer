import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// a small ? beside a heading; hover or focus it to read how that figure is made
export function InfoHint({
  label,
  children,
  className,
}: {
  /** What the hint is about, for screen readers: "About {label}". */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className={cn(
            "inline-flex shrink-0 rounded-sm text-dim/70 transition-colors duration-150 hover:text-foreground",
            className,
          )}
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{children}</TooltipContent>
    </Tooltip>
  );
}
