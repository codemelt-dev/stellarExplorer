// 1 ... 4 5 6 ... 12: first, last and the neighbours of the current page
export function pageWindow(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const shown = new Set([1, pages, page - 1, page, page + 1]);
  // near either end, show a full run so the row doesn't change width
  if (page <= 3) [2, 3, 4].forEach((p) => shown.add(p));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((p) => shown.add(p));
  const out: Array<number | "gap"> = [];
  let prev = 0;
  for (const p of [...shown].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}
