// fixed layer behind everything: drifting color blobs, a static starfield
// and two rare shooting stars. Pure CSS, hidden pieces in light theme

// deterministic star positions, same on server and client
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS = (() => {
  const rand = mulberry32(7);
  return Array.from({ length: 70 }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    o: 0.08 + rand() * 0.22,
    r: rand() < 0.85 ? 0.8 : 1.3,
  }));
})();

export function AmbientBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      <svg className="star-layer absolute inset-0 h-full w-full">
        {STARS.map((star, i) => (
          <circle
            key={i}
            cx={`${star.x}%`}
            cy={`${star.y}%`}
            r={star.r}
            fill="#e8eaed"
            opacity={star.o}
          />
        ))}
      </svg>
      <div className="ambient-blob blob-gold" />
      <div className="ambient-blob blob-violet" />
      <div className="ambient-blob blob-gold-2" />
      <span className="shooting-star star-a" />
      <span className="shooting-star star-b" />
    </div>
  );
}
