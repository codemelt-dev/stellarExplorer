// tiny 7d price sparkline, neutral stroke, no hover
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 56;
  const h = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * w).toFixed(1)},${(
          h - 2 - ((v - min) / range) * (h - 4)
        ).toFixed(1)}`,
    )
    .join("");
  return (
    <svg width={w} height={h} aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke="var(--text-dim)"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
