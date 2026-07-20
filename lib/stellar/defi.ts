import "server-only";

// mainnet DeFi data from two public sources, no keys. Everything is
// edge-cached via fetch revalidate so we never hammer the APIs

const LLAMA = "https://api.llama.fi";
const EXPERT = "https://api.stellar.expert/explorer/public";
const UA = { "User-Agent": "stellar-pulse-explorer" };

// tracked protocols, slugs verified against DefiLlama
export const PROTOCOLS = [
  { slug: "blend", name: "Blend", kind: "Lending" },
  { slug: "aquarius-stellar", name: "Aquarius", kind: "AMM" },
  { slug: "stellar-dex", name: "Stellar DEX", kind: "Orderbook DEX" },
  { slug: "lumenswap", name: "LumenSwap", kind: "DEX" },
  { slug: "balanced-exchange", name: "Balanced", kind: "Exchange" },
  { slug: "soroswap", name: "Soroswap", kind: "AMM" },
  { slug: "phoenix-defi-hub", name: "Phoenix", kind: "AMM" },
];

async function getJson<T>(
  url: string,
  revalidate: number,
  headers?: Record<string, string>,
): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface TvlPoint {
  date: number;
  tvl: number;
}

export async function getChainTvlHistory(): Promise<TvlPoint[] | null> {
  const points = await getJson<TvlPoint[]>(
    `${LLAMA}/v2/historicalChainTvl/Stellar`,
    3600,
  );
  if (!points || points.length < 2) return null;
  return points.slice(-90);
}

export interface ProtocolRow {
  slug: string;
  name: string;
  kind: string;
  logo: string;
  tvl: number | null;
  volume24h: number | null;
  change1d: number | null;
}

export async function getProtocols(): Promise<ProtocolRow[]> {
  const [tvls, dexs] = await Promise.all([
    Promise.all(
      PROTOCOLS.map((p) => getJson<number>(`${LLAMA}/tvl/${p.slug}`, 3600)),
    ),
    getJson<{
      protocols?: Array<{
        name: string;
        total24h?: number | null;
        change_1d?: number | null;
      }>;
    }>(
      `${LLAMA}/overview/dexs/stellar?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`,
      900,
    ),
  ]);

  const rows = PROTOCOLS.map((p, i) => {
    const dex = dexs?.protocols?.find((d) =>
      d.name.toLowerCase().startsWith(p.name.toLowerCase()),
    );
    return {
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      logo: `https://icons.llamao.fi/icons/protocols/${p.slug}?w=48&h=48`,
      tvl: typeof tvls[i] === "number" ? tvls[i] : null,
      volume24h: typeof dex?.total24h === "number" ? dex.total24h : null,
      change1d: typeof dex?.change_1d === "number" ? dex.change_1d : null,
    };
  }).filter((r) => r.tvl !== null);

  return rows.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));
}

export interface TokenRow {
  code: string;
  issuer: string;
  org: string;
  image: string | null;
  price: number | null;
  /** last price vs 7 days ago, in percent */
  change7d: number | null;
  spark: number[];
  volume7dUsd: number;
  trustlines: number;
}

interface ExpertAssetRecord {
  asset: string;
  price?: number;
  price7d?: Array<[number, number]>;
  volume7d?: number;
  trustlines?: number[];
  rating?: { average?: number };
  tomlInfo?: { orgName?: string; image?: string; code?: string };
}

export async function getTopTokens(): Promise<TokenRow[]> {
  const data = await getJson<{
    _embedded?: { records?: ExpertAssetRecord[] };
  }>(`${EXPERT}/asset?sort=volume7d&order=desc&limit=20`, 900, UA);

  const records = data?._embedded?.records ?? [];
  return records
    // orgName + decent rating keeps wash-traded junk assets out
    .filter((r) => r.tomlInfo?.orgName && (r.rating?.average ?? 0) >= 4)
    .slice(0, 6)
    .map((r) => {
      const [code = "?", issuer = ""] = r.asset.split("-");
      const spark = (r.price7d ?? []).map(([, p]) => p);
      const first = spark[0];
      const last = spark[spark.length - 1];
      return {
        code,
        issuer,
        org: r.tomlInfo?.orgName ?? "",
        image: r.tomlInfo?.image ?? null,
        price: r.price ?? null,
        change7d:
          first && last ? ((last - first) / first) * 100 : null,
        spark,
        // stellar.expert amounts come in 1e-7 units
        volume7dUsd: (r.volume7d ?? 0) / 1e7,
        trustlines: r.trustlines?.[0] ?? 0,
      };
    });
}

export interface ProtocolDetail {
  slug: string;
  name: string;
  kind: string;
  logo: string;
  description: string | null;
  website: string | null;
  currentTvl: number | null;
  tvlHistory: TvlPoint[];
}

export async function getProtocolDetail(
  slug: string,
): Promise<ProtocolDetail | null> {
  const meta = PROTOCOLS.find((p) => p.slug === slug);
  if (!meta) return null;

  const data = await getJson<{
    description?: string;
    url?: string;
    tvl?: Array<{ date: number; totalLiquidityUSD: number }>;
  }>(`${LLAMA}/protocol/${slug}`, 3600);

  const tvlHistory = (data?.tvl ?? [])
    .slice(-90)
    .map((p) => ({ date: p.date, tvl: p.totalLiquidityUSD }));

  return {
    slug,
    name: meta.name,
    kind: meta.kind,
    logo: `https://icons.llamao.fi/icons/protocols/${slug}?w=96&h=96`,
    description: data?.description ?? null,
    website: data?.url ?? null,
    currentTvl: tvlHistory[tvlHistory.length - 1]?.tvl ?? null,
    tvlHistory,
  };
}

export interface ProtocolVolume {
  chart: Array<{ date: number; volume: number }>;
  total24h: number | null;
  total7d: number | null;
  total30d: number | null;
  change1d: number | null;
}

// only protocols with a DEX adapter have volume; lending protocols 404 here
export async function getProtocolVolume(
  slug: string,
): Promise<ProtocolVolume | null> {
  const data = await getJson<{
    totalDataChart?: Array<[number, number]>;
    total24h?: number;
    total7d?: number;
    total30d?: number;
    change_1d?: number;
  }>(`${LLAMA}/summary/dexs/${slug}?excludeTotalDataChart=false`, 900);

  if (!data?.totalDataChart?.length) return null;
  return {
    chart: data.totalDataChart.slice(-60).map(([date, volume]) => ({ date, volume })),
    total24h: data.total24h ?? null,
    total7d: data.total7d ?? null,
    total30d: data.total30d ?? null,
    change1d: data.change_1d ?? null,
  };
}

export interface TvlBreakdownRow {
  slug: string;
  name: string;
  logo: string;
  tvl: number;
}

// chain TVL history + per-day per-protocol breakdown for the rich tooltip.
// Day key = unix date / 86400. Same protocol fetches the detail pages use,
// so the Next cache serves them once an hour total
export async function getChainTvlWithBreakdown(): Promise<{
  points: TvlPoint[] | null;
  breakdown: Record<number, TvlBreakdownRow[]>;
}> {
  const [points, details] = await Promise.all([
    getChainTvlHistory(),
    Promise.all(
      PROTOCOLS.map((p) =>
        getJson<{ tvl?: Array<{ date: number; totalLiquidityUSD: number }> }>(
          `${LLAMA}/protocol/${p.slug}`,
          3600,
        ),
      ),
    ),
  ]);

  const breakdown: Record<number, TvlBreakdownRow[]> = {};
  if (points) {
    PROTOCOLS.forEach((p, i) => {
      const byDay = new Map<number, number>();
      for (const t of details[i]?.tvl ?? []) {
        byDay.set(Math.floor(t.date / 86400), t.totalLiquidityUSD);
      }
      for (const pt of points) {
        const key = Math.floor(pt.date / 86400);
        const tvl = byDay.get(key);
        if (tvl && tvl > 1000) {
          (breakdown[key] ??= []).push({
            slug: p.slug,
            name: p.name,
            logo: `https://icons.llamao.fi/icons/protocols/${p.slug}?w=48&h=48`,
            tvl,
          });
        }
      }
    });
    for (const rows of Object.values(breakdown)) {
      rows.sort((a, b) => b.tvl - a.tvl);
    }
  }
  return { points, breakdown };
}
