import Link from "next/link";
import { cn } from "@/lib/utils";

// Segmented's look, but each option is a link, for choices kept in the URL
export function SegmentedLinks({
  label,
  options,
  value,
}: {
  label: string;
  options: Array<{ id: string; label: string; href: string }>;
  value: string;
}) {
  return (
    <nav aria-label={label} className="flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <Link
          key={o.id}
          href={o.href}
          aria-current={o.id === value ? "page" : undefined}
          className={cn(
            "rounded px-2 py-0.5 text-xs transition-colors duration-150",
            o.id === value ? "bg-surface-2 text-foreground" : "text-dim hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
