import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TypeTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

// segmented tabs driven by a ?type= param, so every tab is a shareable URL
export function TypeTabs<T extends string>({
  tabs,
  active,
  basePath,
  label,
}: {
  tabs: TypeTab<T>[];
  active: T;
  basePath: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex w-full gap-1 overflow-x-auto rounded-lg border border-border/60 bg-surface p-1 sm:w-auto sm:self-start"
    >
      {tabs.map(({ id, label, icon: Icon }, i) => {
        const current = id === active;
        return (
          <Link
            key={id}
            href={i === 0 ? basePath : `${basePath}?type=${id}`}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors duration-150 sm:flex-none",
              current
                ? "bg-surface-2 font-medium text-foreground shadow-xs"
                : "text-dim hover:bg-surface-2/50 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-3.5", current ? "text-gold" : "text-dim")} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
