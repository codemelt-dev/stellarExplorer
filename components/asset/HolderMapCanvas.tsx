"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Amount } from "@/components/stellar/Amount";
import { stroopsToLumens } from "@/lib/stellar/amount";
import { compactNumber } from "@/lib/format";
import {
  bubbleLines,
  panBy,
  zoomAt,
  type BubbleLine,
  type Cluster,
  type HolderLayout,
  type MapView,
  type PlacedHolder,
} from "@/lib/stellar/holderMap";
import { truncateKey } from "@/lib/stellar/strkey";
import { cn } from "@/lib/utils";

const CLUSTER_COLORS = 6;
export const clusterColor = (id: number) => `var(--cluster-${(id % CLUSTER_COLORS) + 1})`;
export const hrefOf = (holder: string) =>
  holder.startsWith("C") ? `/contract/${holder}` : `/account/${holder}`;
export const shareText = (share: number | null) =>
  share === null ? "–" : share < 0.01 ? "<0.01%" : `${share.toFixed(2)}%`;

const STEP = 1.6;
const DRAG_PX = 4;
// label sizes in screen pixels, whatever the zoom
const LINE_PX: Record<BubbleLine, number> = { rank: 11, share: 12, address: 10, balance: 10 };

function compactBalance(balance: string): string {
  const n = Number(stroopsToLumens(balance));
  return n >= 1000 ? compactNumber(n) : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// The bubbles, with zoom (buttons, pinch, ctrl or cmd + scroll, double click,
// keys) and drag to pan. Bubbles say more as they grow on screen. Expanded,
// the map fills the window and a plain scroll zooms
export function HolderMapCanvas({
  layout,
  clusters,
  clusterOf,
  active,
  onActive,
  code,
  label,
}: {
  layout: HolderLayout;
  clusters: Cluster[];
  clusterOf: Map<string, number>;
  active: string | null;
  onActive: (holder: string | null) => void;
  code: string;
  label: string;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ box: MapView; view: MapView } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinch: 0, type: "mouse" });
  const tween = useRef(0);
  const shown = useRef<MapView>(layout.box);

  const { box } = layout;
  // a new layout (holders hidden or shown) starts from the whole map again
  const view = zoom && zoom.box === box ? zoom.view : box;
  const scale = box.size / view.size;
  const pxPerUnit = width / view.size;

  useEffect(() => {
    shown.current = view;
  });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // native listener: React's wheel handler is passive and can't stop the page scrolling
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      if (!expanded && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = frame.getBoundingClientRect();
      const delta = Math.max(-60, Math.min(60, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY));
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.004));
      setZoom((z) => ({
        box,
        view: zoomAt(
          z && z.box === box ? z.view : box,
          box,
          factor,
          (e.clientX - rect.left) / rect.width,
          (e.clientY - rect.top) / rect.height,
        ),
      }));
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [box, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    frameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  useEffect(() => () => cancelAnimationFrame(tween.current), []);

  // buttons and keys glide, gestures follow the hand directly
  function glideTo(target: MapView) {
    cancelAnimationFrame(tween.current);
    const from = shown.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setZoom({ box, view: target });
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 220);
      const e = 1 - (1 - p) ** 3;
      setZoom({
        box,
        view: {
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          size: from.size + (target.size - from.size) * e,
        },
      });
      if (p < 1) tween.current = requestAnimationFrame(step);
    };
    tween.current = requestAnimationFrame(step);
  }

  const fraction = (clientX: number, clientY: number) => {
    const rect = frameRef.current!.getBoundingClientRect();
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height] as const;
  };

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as Element).closest("button")) return;
    cancelAnimationFrame(tween.current);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { moved: 0, pinch: 0, type: e.pointerType };
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const frame = frameRef.current!;
    const rect = frame.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      if (gesture.current.moved <= DRAG_PX) return;
      if (!frame.hasPointerCapture(e.pointerId)) frame.setPointerCapture(e.pointerId);
      setZoom((z) => ({
        box,
        view: panBy(z && z.box === box ? z.view : box, box, dx / rect.width, dy / rect.height),
      }));
      return;
    }

    const [a, b] = [...pointers.current.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const [fx, fy] = fraction((a.x + b.x) / 2, (a.y + b.y) / 2);
    const before = gesture.current.pinch;
    gesture.current.pinch = distance;
    gesture.current.moved = Infinity; // a pinch never ends as a tap
    if (!before) return;
    setZoom((z) => ({
      box,
      view: zoomAt(z && z.box === box ? z.view : box, box, distance / before, fx, fy),
    }));
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current.pinch = 0;
  }

  function onDoubleClick(e: React.MouseEvent) {
    if ((e.target as Element).closest("button, [data-holder]")) return;
    glideTo(zoomAt(view, box, 2, ...fraction(e.clientX, e.clientY)));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const pan = (dx: number, dy: number) => glideTo(panBy(view, box, dx, dy));
    const actions: Record<string, () => void> = {
      "+": () => glideTo(zoomAt(view, box, STEP)),
      "=": () => glideTo(zoomAt(view, box, STEP)),
      "-": () => glideTo(zoomAt(view, box, 1 / STEP)),
      "0": () => glideTo(box),
      ArrowLeft: () => pan(0.15, 0),
      ArrowRight: () => pan(-0.15, 0),
      ArrowUp: () => pan(0, 0.15),
      ArrowDown: () => pan(0, -0.15),
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  }

  // a tap shows the details first, a second tap opens the holder
  function open(holder: string) {
    if (gesture.current.moved > DRAG_PX) return;
    if (gesture.current.type === "touch" && active !== holder) {
      onActive(holder);
      return;
    }
    router.push(hrefOf(holder));
  }

  const activeCluster = active ? clusterOf.get(active) : undefined;
  const faded = (holder: string) =>
    active !== null &&
    holder !== active &&
    (activeCluster === undefined || clusterOf.get(holder) !== activeCluster);
  const activeNode = active ? layout.nodes.find((n) => n.holder === active) : undefined;
  const zoomed = scale > 1.001;

  return (
    <div
      className={cn(
        expanded &&
          "fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-background/95 p-4 backdrop-blur-sm",
      )}
    >
      <div
        ref={frameRef}
        tabIndex={0}
        role="group"
        aria-label={`${label}. Plus and minus zoom, arrow keys move, 0 resets.`}
        className="relative aspect-square w-full cursor-grab select-none rounded-lg border border-border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        style={{
          touchAction: zoomed || expanded ? "none" : "pan-x pan-y",
          ...(expanded && { width: "min(100vw - 2rem, 100dvh - 5rem)" }),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={(e) => {
          if (!frameRef.current?.hasPointerCapture(e.pointerId)) onPointerEnd(e);
          if (e.pointerType !== "touch") onActive(null);
        }}
        onClick={(e) => {
          // a tap on empty space closes the details a first tap opened
          if (!(e.target as Element).closest("button, [data-holder]") && gesture.current.moved <= DRAG_PX) {
            onActive(null);
          }
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      >
        <svg
          viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
          className="absolute inset-0 size-full"
          role="img"
          aria-label={label}
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
                pxPerUnit={pxPerUnit}
                code={code}
                onEnter={() => pointers.current.size === 0 && onActive(n.holder)}
                onOpen={() => open(n.holder)}
              />
            ))}
          </g>
        </svg>

        {activeNode && (
          <Tooltip
            node={activeNode}
            view={view}
            code={code}
            cluster={activeCluster === undefined ? undefined : clusters[activeCluster]}
          />
        )}

        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <MapButton label="Zoom in" onClick={() => glideTo(zoomAt(view, box, STEP))}>
            <ZoomIn className="size-4" aria-hidden="true" />
          </MapButton>
          <MapButton label="Zoom out" onClick={() => glideTo(zoomAt(view, box, 1 / STEP))} disabled={!zoomed}>
            <ZoomOut className="size-4" aria-hidden="true" />
          </MapButton>
          <MapButton label="Show the whole map" onClick={() => glideTo(box)} disabled={!zoomed}>
            <RotateCcw className="size-4" aria-hidden="true" />
          </MapButton>
          <MapButton
            label={expanded ? "Close full screen" : "Full screen"}
            onClick={() => setExpanded((was) => !was)}
          >
            {expanded ? (
              <Minimize2 className="size-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-4" aria-hidden="true" />
            )}
          </MapButton>
        </div>
        {zoomed && (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-md border border-border bg-surface/90 px-1.5 py-0.5 font-mono text-[11px] text-dim tabular-nums">
            {scale.toFixed(1)}×
          </span>
        )}
      </div>
      {expanded && (
        <p className="text-xs text-dim">Scroll or pinch to zoom, drag to move, Esc to close.</p>
      )}
    </div>
  );
}

function MapButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-md border border-border bg-surface/90 text-dim transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Bubble({
  node,
  color,
  active,
  faded,
  pxPerUnit,
  code,
  onEnter,
  onOpen,
}: {
  node: PlacedHolder;
  color: string | null;
  active: boolean;
  faded: boolean;
  pxPerUnit: number;
  code: string;
  onEnter: () => void;
  onOpen: () => void;
}) {
  const contract = node.holder.startsWith("C");
  const lines = pxPerUnit > 0 ? bubbleLines(node.r * pxPerUnit) : [];
  const unit = pxPerUnit > 0 ? 1 / pxPerUnit : 0;
  const text: Record<BubbleLine, string> = {
    rank: `#${node.rank}`,
    share: shareText(node.share),
    address: node.label ?? truncateKey(node.holder, 4),
    balance: code.length <= 5 ? `${compactBalance(node.balance)} ${code}` : compactBalance(node.balance),
  };
  const heights = lines.map((line) => LINE_PX[line] * 1.3 * unit);
  const top = node.y - heights.reduce((sum, h) => sum + h, 0) / 2;
  const centers = heights.map((h, i) => top + heights.slice(0, i).reduce((sum, x) => sum + x, 0) + h / 2);
  return (
    <g
      data-holder={node.holder}
      className="cursor-pointer transition-opacity duration-150"
      opacity={faded ? 0.35 : 1}
      onPointerEnter={(e) => e.pointerType !== "touch" && onEnter()}
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
      {lines.map((line, i) => (
        <text
          key={line}
          x={node.x}
          y={centers[i]}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={LINE_PX[line] * unit}
          className={cn(
            "pointer-events-none",
            line === "share" ? "fill-foreground font-semibold" : "fill-dim",
            line !== "share" && "font-mono",
          )}
        >
          {text[line]}
        </text>
      ))}
    </g>
  );
}

function Tooltip({
  node,
  view,
  code,
  cluster,
}: {
  node: PlacedHolder;
  view: MapView;
  code: string;
  cluster?: Cluster;
}) {
  const left = ((node.x - view.x) / view.size) * 100;
  const top = ((node.y - node.r - view.y) / view.size) * 100;
  const bottom = ((node.y + node.r - view.y) / view.size) * 100;
  if (left < 0 || left > 100 || bottom < 0 || top > 100) return null;
  const below = top < 22;
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 flex w-max max-w-64 flex-col gap-0.5 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg",
        left < 20 ? "translate-x-0" : left > 80 ? "-translate-x-full" : "-translate-x-1/2",
        below ? "translate-y-2" : "-translate-y-[calc(100%+0.5rem)]",
      )}
      style={{ left: `${left}%`, top: `${below ? Math.min(bottom, 90) : top}%` }}
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
