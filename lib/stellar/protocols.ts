// tracked DeFi protocols, slugs verified against DefiLlama.
// No server-only import so the header dropdown can use it too

export const PROTOCOLS = [
  { slug: "blend", name: "Blend", kind: "Lending" },
  { slug: "aquarius-stellar", name: "Aquarius", kind: "AMM" },
  { slug: "stellar-dex", name: "Stellar DEX", kind: "Orderbook DEX" },
  { slug: "lumenswap", name: "LumenSwap", kind: "DEX" },
  { slug: "balanced-exchange", name: "Balanced", kind: "Exchange" },
  { slug: "soroswap", name: "Soroswap", kind: "AMM" },
  { slug: "phoenix-defi-hub", name: "Phoenix", kind: "AMM" },
];

export function protocolLogo(slug: string, size = 48): string {
  return `https://icons.llamao.fi/icons/protocols/${slug}?w=${size}&h=${size}`;
}
