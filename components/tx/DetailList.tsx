import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// label/value facts in groups. Groups split by a hairline, rows inside stay open
export function DetailList({ children }: { children: React.ReactNode }) {
  return <Card className="gap-0 divide-y divide-border/60 px-5 py-1">{children}</Card>;
}

export function DetailGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col py-2">{children}</div>;
}

export function DetailRow({
  label,
  help,
  children,
}: {
  label: string;
  /** Plain-language explanation behind the info icon. */
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-6">
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-dim sm:w-52">
        {help && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded-sm text-dim/70 transition-colors duration-150 hover:text-foreground"
                aria-label={`About ${label}`}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              {help}
            </TooltipContent>
          </Tooltip>
        )}
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}
