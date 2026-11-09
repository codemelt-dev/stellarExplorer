import { describe, expect, it } from "vitest";
import {
  bubbleLines,
  clampView,
  clustersOf,
  layoutHolders,
  panBy,
  radiusOf,
  zoomAt,
  type MapHolder,
} from "./holderMap";

const holder = (rank: number, balance: number, share: number | null = balance / 10): MapHolder => ({
  rank,
  holder: `G${String(rank).padStart(55, "A")}`,
  balance: String(balance),
  share,
});

const H = [holder(1, 500), holder(2, 200), holder(3, 120), holder(4, 90), holder(5, 40), holder(6, 10)];
const id = (rank: number) => H[rank - 1].holder;

describe("clustersOf", () => {
  it("joins holders through each other and ranks clusters by share", () => {
    const { clusters, clusterOf } = clustersOf(H, [
      { a: id(3), b: id(4), transfers: 2 },
      { a: id(4), b: id(6), transfers: 1 },
      { a: id(1), b: id(5), transfers: 9 },
    ]);
    expect(clusters).toEqual([
      { id: 0, members: [id(1), id(5)], share: 54 },
      { id: 1, members: [id(3), id(4), id(6)], share: 22 },
    ]);
    expect(clusterOf.get(id(6))).toBe(1);
    expect(clusterOf.has(id(2))).toBe(false);
  });

  it("ignores links to holders that aren't shown", () => {
    const { clusters } = clustersOf(H.slice(0, 2), [{ a: id(1), b: id(5), transfers: 1 }]);
    expect(clusters).toEqual([]);
  });
});

describe("radiusOf", () => {
  it("gives the largest holder the biggest bubble and keeps tiny ones visible", () => {
    expect(radiusOf(100n, 100n)).toBe(56);
    expect(radiusOf(25n, 100n)).toBe(30);
    expect(radiusOf(0n, 100n)).toBe(4);
  });
});

describe("layoutHolders", () => {
  const links = [
    { a: id(1), b: id(5), transfers: 9 },
    { a: id(3), b: id(4), transfers: 2 },
  ];

  it("places every bubble inside the box without overlaps", () => {
    const { nodes, box } = layoutHolders(H, links);
    expect(nodes).toHaveLength(H.length);
    for (const n of nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(box.x);
      expect(n.y - n.r).toBeGreaterThanOrEqual(box.y);
      expect(n.x + n.r).toBeLessThanOrEqual(box.x + box.size);
      expect(n.y + n.r).toBeLessThanOrEqual(box.y + box.size);
    }
    for (const p of nodes) {
      for (const q of nodes) {
        if (p === q) continue;
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(p.r + q.r);
      }
    }
  });

  it("lands the same way every time and keeps the links", () => {
    const first = layoutHolders(H, links);
    expect(layoutHolders(H, links)).toEqual(first);
    expect(first.links.map((l) => [l.a.rank, l.b.rank])).toEqual([
      [1, 5],
      [3, 4],
    ]);
  });
});

describe("zoom", () => {
  const box = { x: -100, y: -100, size: 200 };

  it("keeps the point under the cursor still", () => {
    const view = zoomAt(box, box, 2, 0.25, 0.75);
    expect(view).toEqual({ x: -75, y: -25, size: 100 });
    // the point at 25% / 75% of the view was (-50, 50) before and still is
    expect([view.x + 0.25 * view.size, view.y + 0.75 * view.size]).toEqual([-50, 50]);
    const centered = zoomAt(box, box, 4);
    expect(centered).toEqual({ x: -25, y: -25, size: 50 });
    expect(centered.x + 0.5 * centered.size).toBe(0);
  });

  it("stops at the whole box and at the deepest zoom", () => {
    expect(zoomAt({ x: -10, y: -10, size: 20 }, box, 0.01)).toEqual(box);
    expect(zoomAt(box, box, 1000).size).toBeCloseTo(200 / 24);
  });

  it("pans within the box only", () => {
    const view = { x: -50, y: -50, size: 100 };
    expect(panBy(view, box, 0.25, 0)).toEqual({ x: -75, y: -50, size: 100 });
    expect(panBy(view, box, 5, -5)).toEqual({ x: -100, y: 0, size: 100 });
    expect(clampView({ x: 500, y: 500, size: 50 }, box)).toEqual({ x: 50, y: 50, size: 50 });
  });
});

describe("bubbleLines", () => {
  it("says more as a bubble grows on screen", () => {
    expect(bubbleLines(5)).toEqual([]);
    expect(bubbleLines(12)).toEqual(["rank"]);
    expect(bubbleLines(30)).toEqual(["rank", "share"]);
    expect(bubbleLines(45)).toEqual(["rank", "share", "address"]);
    expect(bubbleLines(80)).toEqual(["rank", "share", "address", "balance"]);
  });
});
