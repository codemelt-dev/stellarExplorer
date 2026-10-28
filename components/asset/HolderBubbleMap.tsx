"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clustersOf, layoutHolders, type MapHolder, type MapLink } from "@/lib/stellar/holderMap";
import { truncateKey } from "@/lib/stellar/strkey";
import { cn } from "@/lib/utils";
import { HolderMapCanvas, clusterColor, hrefOf, shareText } from "./HolderMapCanvas";

const noSubscribe = () => () => {};

// The top holders as bubbles sized by their share of the supply. Holders that
// moved the asset between each other are joined and colored as one cluster.
// The layout runs in the browser only, after hydration
export function HolderBubbleMap({
  holders,
  links,
  code,
  days,
}: {
  holders: MapHolder[];
  /** Null when the links couldn't be loaded. */
  links: MapLink[] | null;
  code: string;
  days: number;
}) {
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);

  const visible = useMemo(() => holders.filter((h) => !hidden.has(h.holder)), [holders, hidden]);
  const { clusters, clusterOf } = useMemo(() => clustersOf(visible, links ?? []), [visible, links]);
  const layout = useMemo(
    () => (mounted ? layoutHolders(visible, links ?? []) : null),
    [mounted, visible, links],
  );
  const clusteredShare = clusters.reduce((sum, c) => sum + c.share, 0);

  function toggle(holder: string) {
    setHidden((was) => {
      const next = new Set(was);
      if (!next.delete(holder)) next.add(holder);
      return next;
    });
    if (active === holder) setActive(null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-2">
        {!layout ? (
          <div className="relative aspect-square w-full rounded-lg border border-border bg-background">
            <Skeleton className="absolute inset-3 rounded-full" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-lg border border-border bg-background text-sm text-dim">
            Every holder is hidden.
            <Button variant="outline" size="sm" onClick={() => setHidden(new Set())}>
              Show all
            </Button>
          </div>
        ) : (
          <HolderMapCanvas
            layout={layout}
            clusters={clusters}
            clusterOf={clusterOf}
            active={active}
            onActive={setActive}
            code={code}
            label={`Top ${visible.length} holders of ${code} as bubbles sized by their share of the supply`}
          />
        )}
        <p className="text-xs text-dim">
          Bubble size is the share of the supply.{" "}
          {links === null
            ? "Transfers between holders couldn't be loaded right now."
            : clusters.length
              ? `Lines join holders that moved ${code} between each other in the last ${days} days; each color is a cluster. ${clusters.length === 1 ? "1 cluster holds" : `${clusters.length} clusters hold`} ${clusteredShare.toFixed(2)}% of the supply.`
              : `None of these holders moved ${code} between each other in the last ${days} days.`}{" "}
          Dashed bubbles are contracts. Pinch or ctrl + scroll to zoom, drag to move; bubbles show
          more as they grow.
        </p>
      </div>

      <div className="relative min-h-0 rounded-lg border border-border">
        <div className="flex max-h-[26rem] flex-col overflow-y-auto lg:absolute lg:inset-0 lg:max-h-none">
          <div className="sticky top-0 z-[1] flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 text-xs font-medium uppercase tracking-wider text-dim">
            <span>Holder</span>
            {hidden.size > 0 ? (
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                className="rounded-sm normal-case tracking-normal text-gold hover:underline"
              >
                Show all ({hidden.size} hidden)
              </button>
            ) : (
              <span>Share</span>
            )}
          </div>
          {holders.map((h) => {
            const off = hidden.has(h.holder);
            const cluster = clusterOf.get(h.holder);
            return (
              <div
                key={h.holder}
                onPointerEnter={(e) => e.pointerType !== "touch" && !off && setActive(h.holder)}
                onPointerLeave={(e) => e.pointerType !== "touch" && setActive(null)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 border-b border-border px-2 text-sm last:border-b-0",
                  h.holder === active && "bg-surface-2",
                  off && "opacity-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(h.holder)}
                  aria-pressed={!off}
                  aria-label={`${off ? "Show" : "Hide"} holder ${h.rank} on the map`}
                  className="flex size-6 shrink-0 items-center justify-center rounded-sm text-dim hover:text-foreground"
                >
                  {off ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                </button>
                <span className="w-7 shrink-0 text-xs text-dim tabular-nums">#{h.rank}</span>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: cluster === undefined ? "transparent" : clusterColor(cluster) }}
                  aria-hidden="true"
                />
                <Link
                  href={hrefOf(h.holder)}
                  className="min-w-0 flex-1 truncate rounded-sm font-mono text-xs hover:text-gold"
                  title={h.holder}
                >
                  {h.label && <span className="mr-1.5 font-sans text-dim">{h.label}</span>}
                  {truncateKey(h.holder, 5)}
                </Link>
                <span className="shrink-0 font-mono text-xs tabular-nums">{shareText(h.share)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
