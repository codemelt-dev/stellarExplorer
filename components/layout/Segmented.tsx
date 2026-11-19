"use client";

import { cn } from "@/lib/utils";

// a small row of toggle buttons, one pressed at a time
export function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded px-2 py-0.5 text-xs transition-colors duration-150",
            o.id === value ? "bg-surface-2 text-foreground" : "text-dim hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
