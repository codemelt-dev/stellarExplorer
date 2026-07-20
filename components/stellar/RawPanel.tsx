"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CopyButton } from "./CopyButton";
import { cn } from "@/lib/utils";

// raw data sits one level deeper, behind an explicit toggle
export function RawPanel({
  entries,
  label = "Raw",
  className,
}: {
  entries: Array<{ label: string; value: string }>;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const items = entries.filter((e) => e.value);
  if (items.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 rounded text-xs uppercase tracking-wider text-dim transition-colors duration-150 hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-150",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
          {label}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="mt-2 flex flex-col gap-3 rounded-md bg-surface-2 p-3">
          {items.map((entry) => (
            <div key={entry.label}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-dim">
                  {entry.label}
                </span>
                <CopyButton value={entry.value} label={`Copy ${entry.label}`} />
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground/80">
                {entry.value}
              </pre>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
