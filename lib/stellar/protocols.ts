// tracked DeFi protocols, slugs verified against DefiLlama.
// No server-only import so the header dropdown can use it too

export interface TrackedProtocol {
  slug: string;
  name: string;
  kind: string;
  /** Ours in place of DefiLlama's, where its listing is wrong or empty. */
  website?: string;
  description?: string;
}

export const PROTOCOLS: TrackedProtocol[] = [
  { slug: "blend", name: "Blend", kind: "Lending" },
  { slug: "aquarius-stellar", name: "Aquarius", kind: "AMM" },
  { slug: "stellar-dex", name: "Stellar DEX", kind: "Orderbook DEX" },
  { slug: "lumenswap", name: "LumenSwap", kind: "DEX" },
  { slug: "balanced-exchange", name: "Balanced", kind: "Exchange" },
  {
    slug: "soroswap",
    name: "Soroswap",
    kind: "AMM",
    // DefiLlama lists no website and another project's description
    website: "https://soroswap.finance",
    description:
      "Soroswap is an open-source AMM on Stellar, built on Soroban smart contracts, with a router for multi-hop swaps.",
  },
  { slug: "phoenix-defi-hub", name: "Phoenix", kind: "AMM" },
];

// Stellar's built-in pools: not a DefiLlama protocol, their page is all ours
export const CLASSIC_AMM = {
  slug: "stellar-amm",
  name: "Stellar AMM",
  kind: "Classic AMM pools",
  href: "/defi/stellar-amm",
  description:
    "Stellar's built-in liquidity pools: constant product pools of two assets, run by the network itself with a 0.30% fee, no smart contract involved.",
};

export function protocolLogo(slug: string, size = 48): string {
  return `https://icons.llamao.fi/icons/protocols/${slug}?w=${size}&h=${size}`;
}
