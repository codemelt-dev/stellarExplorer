import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export interface MapHolder {
  rank: number;
  holder: string;
  /** Base units as a digit string. */
  balance: string;
  /** Percent of the supply, null when the supply is unknown. */
  share: number | null;
  /** What we know the holder is, e.g. "issuer". */
  label?: string;
}

export interface MapLink {
  a: string;
  b: string;
  transfers: number;
}

export interface Cluster {
  /** 0 is the cluster holding the most. */
  id: number;
  members: string[];
  share: number;
}

/**
 * Holders joined by transfers, directly or through each other, largest share
 * first. A holder with no links to the others belongs to no cluster.
 */
export function clustersOf(
  holders: MapHolder[],
  links: MapLink[],
): { clusters: Cluster[]; clusterOf: Map<string, number> } {
  const parent = new Map(holders.map((h) => [h.holder, h.holder]));
  const root = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const { a, b } of links) {
    if (parent.has(a) && parent.has(b)) parent.set(root(a), root(b));
  }

  const groups = new Map<string, MapHolder[]>();
  for (const h of holders) {
    const r = root(h.holder);
    groups.set(r, [...(groups.get(r) ?? []), h]);
  }
  const clusters = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      members: g.map((h) => h.holder),
      share: g.reduce((sum, h) => sum + (h.share ?? 0), 0),
      top: Math.min(...g.map((h) => h.rank)),
    }))
    .sort((x, y) => y.share - x.share || x.top - y.top)
    .map(({ members, share }, id) => ({ id, members, share }));

  const clusterOf = new Map<string, number>();
  for (const c of clusters) for (const m of c.members) clusterOf.set(m, c.id);
  return { clusters, clusterOf };
}

const MIN_R = 4;
const MAX_R = 56;

/** Bubble area follows the balance, the largest holder gets MAX_R. */
export function radiusOf(balance: bigint, largest: bigint): number {
  if (largest <= 0n || balance <= 0n) return MIN_R;
  const ratio = Number((balance * 1_000_000n) / largest) / 1_000_000;
  return MIN_R + (MAX_R - MIN_R) * Math.sqrt(ratio);
}

export interface PlacedHolder extends MapHolder {
  x: number;
  y: number;
  r: number;
}

export interface HolderLayout {
  nodes: PlacedHolder[];
  links: Array<{ a: PlacedHolder; b: PlacedHolder; transfers: number }>;
  /** Square viewBox around every bubble. */
  box: { x: number; y: number; size: number };
}

type Node = SimulationNodeDatum & PlacedHolder;

// grid cells nearest the center first, so the largest holders start there
function startCells(n: number): Array<[number, number]> {
  const side = Math.ceil(Math.sqrt(n)) + 2;
  const half = Math.floor(side / 2);
  const cells: Array<[number, number]> = [];
  for (let y = -half; y <= half; y++) for (let x = -half; x <= half; x++) cells.push([x, y]);
  return cells.sort((p, q) => p[0] ** 2 + p[1] ** 2 - (q[0] ** 2 + q[1] ** 2) || p[1] - q[1] || p[0] - q[0]);
}

/**
 * Settles the bubbles with a force layout: linked holders pull together,
 * nothing overlaps. Seeded, so the same holders always land the same way.
 */
export function layoutHolders(holders: MapHolder[], links: MapLink[]): HolderLayout {
  if (!holders.length) return { nodes: [], links: [], box: { x: -50, y: -50, size: 100 } };
  const largest = holders.reduce((m, h) => (BigInt(h.balance) > m ? BigInt(h.balance) : m), 0n);
  const cells = startCells(holders.length);
  const nodes: Node[] = holders.map((h, i) => ({
    ...h,
    r: radiusOf(BigInt(h.balance), largest),
    x: cells[i][0] * 2 * MAX_R,
    y: cells[i][1] * 2 * MAX_R,
  }));
  const byHolder = new Map(nodes.map((n) => [n.holder, n]));
  const edges: Array<SimulationLinkDatum<Node> & { source: Node; target: Node; transfers: number }> =
    links.flatMap((l) => {
      const source = byHolder.get(l.a);
      const target = byHolder.get(l.b);
      return source && target ? [{ source, target, transfers: l.transfers }] : [];
    });

  let seed = 1;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  forceSimulation(nodes)
    .randomSource(random)
    // fixed decay, the default one comes from Math.pow
    .alphaDecay(0.0228)
    .force("charge", forceManyBody<Node>().strength(-20))
    .force("collide", forceCollide<Node>((n) => n.r + 3).iterations(2))
    .force(
      "link",
      forceLink<Node, (typeof edges)[number]>(edges)
        .distance((l) => l.source.r + l.target.r + 18)
        .strength(0.5),
    )
    .force("x", forceX<Node>(0).strength(0.07))
    .force("y", forceY<Node>(0).strength(0.07))
    .stop()
    .tick(300);

  const pad = 6;
  const minX = Math.min(...nodes.map((n) => n.x - n.r)) - pad;
  const maxX = Math.max(...nodes.map((n) => n.x + n.r)) + pad;
  const minY = Math.min(...nodes.map((n) => n.y - n.r)) - pad;
  const maxY = Math.max(...nodes.map((n) => n.y + n.r)) + pad;
  const size = Math.max(maxX - minX, maxY - minY);
  const round = (v: number) => Math.round(v * 100) / 100;
  const placed = nodes.map(({ rank, holder, balance, share, label, x, y, r }) => ({
    rank,
    holder,
    balance,
    share,
    label,
    x: round(x),
    y: round(y),
    r: round(r),
  }));
  const byPlaced = new Map(placed.map((n) => [n.holder, n]));
  return {
    nodes: placed,
    links: edges.map((e) => ({
      a: byPlaced.get(e.source.holder)!,
      b: byPlaced.get(e.target.holder)!,
      transfers: e.transfers,
    })),
    box: {
      x: round(minX - (size - (maxX - minX)) / 2),
      y: round(minY - (size - (maxY - minY)) / 2),
      size: round(size),
    },
  };
}
