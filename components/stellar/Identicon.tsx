import { strkeyPayload } from "@/lib/stellar/strkey";

// deterministic 7x7 identicon, mirrored halves, hue from the key bytes.
// Same address always draws the same pattern
export function Identicon({
  address,
  size = 16,
  className,
}: {
  address: string;
  size?: number;
  className?: string;
}) {
  const payload = strkeyPayload(address);
  if (payload.length < 16) return <span style={{ width: size, height: size }} />;

  const cells: boolean[] = [];
  // 7 rows x 4 half-columns = 28 bits from bytes 1..
  for (let i = 0; i < 28; i++) {
    const byte = payload[1 + (i >> 3)] ?? 0;
    cells.push(((byte >> (7 - (i % 8))) & 1) === 1);
  }

  const hue = Math.round((payload[0] / 255) * 360);
  const color = `hsl(${hue} 60% 62%)`;

  const rects: React.ReactNode[] = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 4; col++) {
      if (!cells[row * 4 + col]) continue;
      rects.push(
        <rect key={`${row}-${col}`} x={col} y={row} width={1} height={1} />,
      );
      if (col < 3) {
        rects.push(
          <rect key={`${row}-m${col}`} x={6 - col} y={row} width={1} height={1} />,
        );
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 7 7"
      fill={color}
      className={className}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}
