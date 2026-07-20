"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Address } from "./Address";
import type { DecodedValue } from "@/lib/stellar/xdrDecode";
import { cn } from "@/lib/utils";

// decoded ScVal tree. Long arrays collapse to "N items"
export function ScValView({
  value,
  depth = 0,
}: {
  value: DecodedValue;
  depth?: number;
}) {
  switch (value.kind) {
    case "scalar":
      if (value.hint === "address") {
        return <Address address={value.text} />;
      }
      return (
        <span
          className={cn(
            "font-mono text-sm break-all",
            value.hint === "number" ? "text-foreground" : "text-foreground/90",
          )}
        >
          {value.hint === "string" ? `"${value.text}"` : value.text}
        </span>
      );
    case "list":
      return <CollapsibleList value={value} depth={depth} />;
    case "map":
      return (
        <div className={cn("flex flex-col gap-1", depth > 0 && "mt-1")}>
          {value.entries.map((entry, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-sm text-dim">{entry.key}:</span>
              <ScValView value={entry.value} depth={depth + 1} />
            </div>
          ))}
        </div>
      );
    case "raw":
      return (
        <span className="font-mono text-xs text-dim break-all">
          Unrecognized value. View raw: {value.text}
        </span>
      );
  }
}

function CollapsibleList({
  value,
  depth,
}: {
  value: Extract<DecodedValue, { kind: "list" }>;
  depth: number;
}) {
  // Long arrays collapse by default; short ones render inline.
  const [open, setOpen] = useState(value.items.length <= 3 && depth < 2);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1 rounded font-mono text-sm text-dim transition-colors duration-150 hover:text-foreground"
      >
        {value.items.length} item{value.items.length === 1 ? "" : "s"}
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 border-l border-border pl-3">
      {value.items.map((item, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-dim select-none">{i}</span>
          <ScValView value={item} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}
