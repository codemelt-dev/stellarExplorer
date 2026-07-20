"use client";

import { useState } from "react";

// DefiLlama-hosted logo, falls back to an initial-letter chip
export function ProtocolIcon({ logo, name }: { logo: string; name: string }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-dim">
        {name[0]}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo}
      alt={`${name} logo`}
      width={20}
      height={20}
      className="size-5 shrink-0 rounded-full"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
