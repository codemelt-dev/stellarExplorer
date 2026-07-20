"use client";

import { useState } from "react";
import { Identicon } from "@/components/stellar/Identicon";

// real token icon from the issuer's toml, identicon when it's missing or broken
export function TokenIcon({
  image,
  issuer,
  code,
}: {
  image: string | null;
  issuer: string;
  code: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!image || broken) {
    return (
      <Identicon address={issuer} size={20} className="shrink-0 rounded-full" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={`${code} icon`}
      width={20}
      height={20}
      className="size-5 shrink-0 rounded-full"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
