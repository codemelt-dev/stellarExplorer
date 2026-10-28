"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Amount } from "@/components/stellar/Amount";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { clustersOf, layoutHolders, type MapHolder, type MapLink, type PlacedHolder } from "@/lib/stellar/holderMap";
import { truncateKey } from "@/lib/stellar/strkey";
import { cn } from "@/lib/utils";

const CLUSTER_COLORS = 6;
const clusterColor = (id: number) => `var(--cluster-${(id % CLUSTER_COLORS) + 1})`;
const hrefOf = (holder: string) => (holder.startsWith("C") ? `/contract/${holder}` : `/account/${holder}`);
const shareText = (share: number | null) =>
  share === null ? "–" : share < 0.01 ? "<0.01%" : `${share.toFixed(2)}%`;

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
  const router = useRouter();
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const pointer = useRef<string>("mouse");

  const visible = useMemo(() => holders.filter((h) => !hidden.has(h.holder)), [holders, hidden]);
  const { clusters, clusterOf } = useMemo(() => clustersOf(visible, links ?? []), [visible, links]);
  const layout = useMemo(
    () => (mounted ? layoutHolders(visible, links ?? []) : null),
    [mounted, visible, links],
  );

  const activeCluster = active ? clusterOf.get(active) : undefined;
  const activeNode = active ? layout?.nodes.find((n) => n.holder === active) : undefined;
  const clusteredShare = clusters.reduce((sum, c) => sum + c.share, 0);

  function toggle(holder: string) {
    setHidden((was) => {
      const next = new Set(was);
      if (!next.delete(holder)) next.add(holder);
      return next;
    });
    if (active === holder) setActive(null);
  }

  // a tap shows the details first, a second tap opens the holder
  function open(holder: string) {
    if (pointer.current === "touch" && active !== holder) {
      setActive(holder);
      return;
    }
    router.push(hrefOf(holder));
  }

  const faded = (holder: string) =>
    active !== null &&
    holder !== active &&
    (activeCluster === undefined || clusterOf.get(holder) !== activeCluster);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="relative aspect-square w-full rounded-lg border border-border bg-background">
          {!layout ? (
            <Skeleton className="absolute inset-3 rounded-full" />
          ) : visible.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-dim">
              Every holder is hidden.
              <Button variant="outline" size="sm" onClick={() => setHidden(new Set())}>
                Show all
              </Button>
            </div>
          ) : (
            <svg
              viewBox={`${layout.box.x} ${layout.box.y} ${layout.box.size} ${layout.box.size}`}
              className="absolute inset-0 size-full"
              role="img"
              aria-label={`Top ${visible.length} holders of ${code} as bubbles sized by their share of the supply`}
              onPointerLeave={() => setActive(null)}
            >
              <g>
                {layout.links.map((l) => {
                  const cluster = clusterOf.get(l.a.holder);
                  return (
                    <line
                      key={`${l.a.holder}-${l.b.holder}`}
                      x1={l.a.x}
                      y1={l.a.y}
                      x2={l.b.x}
                      y2={l.b.y}
                      stroke={cluster === undefined ? "var(--line)" : clusterColor(cluster)}
                      strokeOpacity={faded(l.a.holder) ? 0.15 : 0.6}
                      strokeWidth={1.25}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>
              <g>
                {layout.nodes.map((n) => (
                  <Bubble
                    key={n.holder}
                    node={n}
                    color={clusterOf.has(n.holder) ? clusterColor(clusterOf.get(n.holder)!) : null}
                    active={n.holder === active}
                    faded={faded(n.holder)}
                    onEnter={() => setActive(n.holder)}
                    onPointerDown={(type) => (pointer.current = type)}
                    onOpen={() => open(n.holder)}
                  />
                ))}
              </g>
            </svg>
          )}
          {layout && activeNode && (
            <Tooltip
              node={activeNode}
              box={layout.box}
              code={code}
              cluster={activeCluster === undefined ? undefined : clusters[activeCluster]}
            />
          )}
        </div>
        <p className="text-xs text-dim">
          Bubble size is the share of the supply.{" "}
          {links === null
            ? "Transfers between holders couldn't be loaded right now."
            : clusters.length
              ? `Lines join holders that moved ${code} between each other in the last ${days} days; each color is a cluster. ${clusters.length === 1 ? "1 cluster holds" : `${clusters.length} clusters hold`} ${clusteredShare.toFixed(2)}% of the supply.`
              : `None of these holders moved ${code} between each other in the last ${days} days.`}{" "}
          Dashed bubbles are contracts.
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
                onPointerEnter={() => !off && setActive(h.holder)}
                onPointerLeave={() => setActive(null)}
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

function Bubble({
  node,
  color,
  active,
  faded,
  onEnter,
  onPointerDown,
  onOpen,
}: {
  node: PlacedHolder;
  color: string | null;
  active: boolean;
  faded: boolean;
  onEnter: () => void;
  onPointerDown: (type: string) => void;
  onOpen: () => void;
}) {
  const contract = node.holder.startsWith("C");
  return (
    <g
      className="cursor-pointer transition-opacity duration-150"
      opacity={faded ? 0.35 : 1}
      onPointerEnter={onEnter}
      onPointerDown={(e) => onPointerDown(e.pointerType)}
      onClick={onOpen}
    >
      <circle
        cx={node.x}
        cy={node.y}
        r={node.r}
        fill={color ? `color-mix(in srgb, ${color} 22%, transparent)` : "var(--surface-2)"}
        stroke={active ? "var(--text-hi)" : (color ?? "var(--line)")}
        strokeWidth={active ? 2 : 1.25}
        strokeDasharray={contract ? "3 2" : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {node.r >= 16 && (
        <text
          x={node.x}
          y={node.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.min(node.r * 0.42, 18)}
          className="pointer-events-none fill-dim font-mono"
        >
          #{node.rank}
        </text>
      )}
    </g>
  );
}

function Tooltip({
  node,
  box,
  code,
  cluster,
}: {
  node: PlacedHolder;
  box: { x: number; y: number; size: number };
  code: string;
  cluster?: { id: number; members: string[]; share: number };
}) {
  const left = ((node.x - box.x) / box.size) * 100;
  const top = ((node.y - node.r - box.y) / box.size) * 100;
  const below = top < 22;
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 flex w-max max-w-64 flex-col gap-0.5 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg",
        left < 20 ? "translate-x-0" : left > 80 ? "-translate-x-full" : "-translate-x-1/2",
        below ? "translate-y-2" : "-translate-y-[calc(100%+0.5rem)]",
      )}
      style={{
        left: `${left}%`,
        top: below ? `${((node.y + node.r - box.y) / box.size) * 100}%` : `${top}%`,
      }}
    >
      <span className="flex items-center gap-2">
        <span className="text-dim tabular-nums">#{node.rank}</span>
        <span className="font-mono">{truncateKey(node.holder, 6)}</span>
        {node.label && <span className="text-dim">{node.label}</span>}
      </span>
      <Amount amount={stroopsToLumens(node.balance)} assetCode={code} maxDecimals={2} />
      <span className="text-dim">{shareText(node.share)} of the supply</span>
      {cluster && (
        <span style={{ color: clusterColor(cluster.id) }}>
          Cluster {cluster.id + 1}: {cluster.members.length} holders, {cluster.share.toFixed(2)}%
        </span>
      )}
    </div>
  );
}
