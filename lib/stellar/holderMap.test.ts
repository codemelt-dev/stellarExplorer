import { describe, expect, it } from "vitest";
import { clustersOf, layoutHolders, radiusOf, type MapHolder } from "./holderMap";

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
