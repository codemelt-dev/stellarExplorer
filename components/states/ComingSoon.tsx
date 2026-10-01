import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SearchBox } from "@/components/layout/SearchBox";

// placeholder for sections waiting on the indexer, says what's coming and what works today
export function ComingSoon({
  icon: Icon,
  title,
  description,
  planned,
  meanwhile,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  planned: string[];
  meanwhile: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-10 sm:py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface">
          <Icon className="size-5 text-gold" aria-hidden="true" />
        </span>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-dim">
          Coming soon
        </span>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="max-w-md text-sm text-dim">{description}</p>
      </div>

      <Card className="gap-3 p-5">
        <h2 className="text-xs font-medium uppercase tracking-wider text-dim">What&apos;s planned</h2>
        <ul className="flex flex-col gap-2">
          {planned.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-dim" aria-hidden="true" />
              {p}
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-dim">{meanwhile}</p>
        <SearchBox className="w-full max-w-md" />
        <Link
          href="/"
          className="rounded-sm text-sm text-gold underline-offset-4 hover:underline"
        >
          Back to the live network
        </Link>
      </div>
    </div>
  );
}
