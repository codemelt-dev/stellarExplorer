"use client";

// odometer-style digits: each one is a 0-9 column that slides to the
// current value. Separators stay put. Reduced motion kills the transition
export function RollingNumber({ value }: { value: number }) {
  const chars = value.toLocaleString("en-US").split("");
  return (
    <span className="inline-flex">
      {chars.map((char, i) =>
        /\d/.test(char) ? (
          <RollingDigit key={`${chars.length - i}`} digit={Number(char)} />
        ) : (
          <span key={`sep-${chars.length - i}`}>{char}</span>
        ),
      )}
    </span>
  );
}

function RollingDigit({ digit }: { digit: number }) {
  return (
    <span className="inline-block h-[1em] overflow-hidden leading-none align-baseline">
      <span
        className="flex flex-col transition-transform duration-300 ease-out"
        style={{ transform: `translateY(-${digit}em)` }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="h-[1em] leading-none">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}
