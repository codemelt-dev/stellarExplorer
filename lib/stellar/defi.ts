import "server-only";
import { Horizon } from "@stellar/stellar-sdk";
import { freshCache } from "../cache";
import { horizonFor } from "./horizon";
import { getNetwork } from "./config";
import { withIndexer } from "./indexer/client";
import { indexedLatestTrades } from "./indexer/trades";
import { CLASSIC_AMM, PROTOCOLS, protocolLogo } from "./protocols";

// mainnet DeFi data from public sources, no keys. Everything is
// edge-cached via fetch revalidate so we never hammer the APIs

const LLAMA = "https://api.llama.fi";

export { PROTOCOLS };


async function getJson<T>(
  url: string,
  revalidate: number,
): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate } });
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
      logo: protocolLogo(p.slug),
      tvl: typeof tvls[i] === "number" ? tvls[i] : null,
      volume24h: typeof dex?.total24h === "number" ? dex.total24h : null,
      change1d: typeof dex?.change_1d === "number" ? dex.change_1d : null,
    };
  }).filter((r) => r.tvl !== null);

  return rows.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));
}

export interface ProtocolDetail {
  slug: string;
  name: string;
  kind: string;
  /** Null for Stellar's own pools, drawn with the Stellar mark. */
  logo: string | null;
  description: string | null;
  website: string | null;
  currentTvl: number | null;
  tvlHistory: TvlPoint[];
}

export async function getProtocolDetail(
  slug: string,
): Promise<ProtocolDetail | null> {
  // not on DefiLlama: everything on its page comes from our index
  if (slug === CLASSIC_AMM.slug) {
    const { name, kind, description } = CLASSIC_AMM;
    return { slug, name, kind, logo: null, description, website: null, currentTvl: null, tvlHistory: [] };
  }
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
    logo: protocolLogo(slug, 96),
    description: meta.description ?? data?.description ?? null,
    website: meta.website ?? (data?.url || null),
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
  /** Null for Stellar's own classic pools, drawn with the Stellar mark. */
  logo: string | null;
  tvl: number;
  /** DefiLlama's figure, for a protocol our index doesn't measure yet. */
  llama?: boolean;
}

/**
 * Each protocol's TVL per UTC day from DefiLlama, by slug; day key = unix
 * date / 86400. Same fetches the detail pages use, so the Next cache serves
 * them once an hour in total.
 */
export async function getProtocolTvlDays(): Promise<Map<string, Map<number, number>>> {
  const details = await Promise.all(
    PROTOCOLS.map((p) =>
      getJson<{ tvl?: Array<{ date: number; totalLiquidityUSD: number }> }>(
        `${LLAMA}/protocol/${p.slug}`,
        3600,
      ),
    ),
  );
  return new Map(
    PROTOCOLS.map((p, i) => [
      p.slug,
      new Map((details[i]?.tvl ?? []).map((t) => [Math.floor(t.date / 86400), t.totalLiquidityUSD])),
    ]),
  );
}

export interface DexTrade {
  id: string;
  closedAt: string;
  account: string | null;
  poolId: string | null;
  baseAmount: string;
  baseCode: string;
  baseIssuer?: string;
  counterAmount: string;
  counterCode: string;
  counterIssuer?: string;
  price: number;
  venue: "orderbook" | "pool";
  /** Null when the fill came from Horizon, which doesn't give it. */
  txHash: string | null;
}

// throws on indexer errors so the cache keeps only good results
const cachedTrades = freshCache(indexedLatestTrades, ["order-book-fills"], { revalidate: 60 });

// the order book's latest fills, always mainnet
export function getDexTrades(limit = 25): Promise<DexTrade[] | null> {
  return withIndexer("dex trades", () => cachedTrades(limit), () => horizonDexTrades(limit), {
    anyNetwork: true,
  });
}

async function horizonDexTrades(limit: number): Promise<DexTrade[] | null> {
  try {
    const page = await horizonFor(getNetwork("mainnet").horizonUrl)
      .trades()
      .forType(Horizon.ServerApi.TradeType.orderbook)
      .order("desc")
      .limit(limit)
      .call();
    return page.records.map((r) => {
      const t = r as typeof r & Record<string, unknown>;
      const code = (type: unknown, c: unknown) =>
        type === "native" ? "XLM" : String(c ?? "?");
      const issuer = (type: unknown, i: unknown) =>
        type === "native" ? undefined : (i as string | undefined);
      const price = t.price as { n: string | number; d: string | number } | undefined;
      return {
        id: String(t.id),
        closedAt: String(t.ledger_close_time),
        account: (t.base_account ?? t.counter_account ?? null) as string | null,
        poolId: (t.base_liquidity_pool_id ?? t.counter_liquidity_pool_id ?? null) as string | null,
        baseAmount: String(t.base_amount),
        baseCode: code(t.base_asset_type, t.base_asset_code),
        baseIssuer: issuer(t.base_asset_type, t.base_asset_issuer),
        counterAmount: String(t.counter_amount),
        counterCode: code(t.counter_asset_type, t.counter_asset_code),
        counterIssuer: issuer(t.counter_asset_type, t.counter_asset_issuer),
        price: price ? Number(price.n) / Number(price.d) : 0,
        venue: t.trade_type === "liquidity_pool" ? "pool" : "orderbook",
        txHash: null,
      };
    });
  } catch {
    return null;
  }
}
