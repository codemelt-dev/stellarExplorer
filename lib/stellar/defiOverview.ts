import "server-only";
import { getProtocols, getProtocolTvlDays, type TvlBreakdownRow, type TvlPoint } from "./defi";
import { getOrderBookTotals, getOrderBookTvlHistory } from "./orderBook";
import { getProtocolTotals, getProtocolTvlHistory, type PoolProtocol } from "./pools";
import { CLASSIC_AMM, PROTOCOLS, protocolLogo } from "./protocols";

// our own numbers wherever the index measures a protocol, DefiLlama's for the rest

const SLUG: Record<PoolProtocol, string> = { classic: "classic", aquarius: "aquarius-stellar", soroswap: "soroswap" };
const ORDER_BOOK = "stellar-dex";
const DAYS = 90;
// below this a protocol is noise in the breakdown
const MIN_TVL = 1000;

export interface TopProtocol {
  key: string;
  name: string;
  kind: string;
  href: string;
  /** Null for Stellar's own classic pools, drawn with the Stellar mark. */
  logo: string | null;
  tvl: number;
  volume24h: number | null;
  change1d: number | null;
  /** True when the numbers are DefiLlama's because our index doesn't measure it yet. */
  llama: boolean;
}

/** Protocols by value locked, ours where we index them. */
export async function getTopProtocols(): Promise<TopProtocol[]> {
  const [totals, orderBook, llama] = await Promise.all([getProtocolTotals(), getOrderBookTotals(), getProtocols()]);
  const ours = new Map<string, { tvl: number; volume24h: number }>();
  for (const t of totals ?? []) {
    if (t.pools > 0) ours.set(SLUG[t.protocol], { tvl: t.tvlUsd, volume24h: t.volume24hUsd });
  }
  if (orderBook && orderBook.tvlUsd > 0) ours.set(ORDER_BOOK, { tvl: orderBook.tvlUsd, volume24h: orderBook.volume24hUsd });

  const rows: TopProtocol[] = [];
  const classic = ours.get("classic");
  if (classic) {
    const { name, kind, href } = CLASSIC_AMM;
    rows.push({ key: "classic", name, kind, href, logo: null, tvl: classic.tvl, volume24h: classic.volume24h, change1d: null, llama: false });
  }
  for (const p of PROTOCOLS) {
    const base = { key: p.slug, name: p.name, kind: p.kind, href: `/defi/${p.slug}`, logo: protocolLogo(p.slug) };
    const mine = ours.get(p.slug);
    const theirs = llama.find((l) => l.slug === p.slug);
    if (mine) rows.push({ ...base, tvl: mine.tvl, volume24h: mine.volume24h, change1d: null, llama: false });
    else if (theirs?.tvl != null) {
      rows.push({ ...base, tvl: theirs.tvl, volume24h: theirs.volume24h, change1d: theirs.change1d, llama: true });
    }
  }
  return rows.sort((a, b) => b.tvl - a.tvl);
}

/**
 * Value locked over the last 90 days, the sum of every protocol we list. Each
 * day takes our figure for a protocol when the index has that day, else
 * DefiLlama's, so the breakdown says which is which.
 */
export async function getTvlChart(): Promise<{ points: TvlPoint[] | null; breakdown: Record<number, TvlBreakdownRow[]> }> {
  const [llama, pools, orderBook, orderBookNow] = await Promise.all([
    getProtocolTvlDays(),
    getProtocolTvlHistory(),
    getOrderBookTvlHistory(),
    getOrderBookTotals(),
  ]);
  const ours = new Map<string, Map<number, number>>();
  const add = (slug: string, date: number, tvl: number) =>
    (ours.get(slug) ?? ours.set(slug, new Map()).get(slug)!).set(Math.floor(date / 86400), tvl);
  for (const d of pools ?? []) {
    for (const [protocol, tvl] of Object.entries(d.tvl)) add(SLUG[protocol as PoolProtocol], d.date, tvl);
  }
  for (const d of orderBook ?? []) add(ORDER_BOOK, d.date, d.tvl);
  // today's daily copy isn't made until the day ends, so today is the live book
  const today = Math.floor(Date.now() / 86_400_000);
  if (orderBookNow && orderBookNow.tvlUsd > 0) add(ORDER_BOOK, today * 86400, orderBookNow.tvlUsd);

  const breakdown: Record<number, TvlBreakdownRow[]> = {};
  const points: TvlPoint[] = [];
  for (let day = today - DAYS + 1; day <= today; day++) {
    const rows: TvlBreakdownRow[] = [];
    const classic = ours.get("classic")?.get(day);
    if (classic && classic > MIN_TVL) rows.push({ slug: "classic", name: CLASSIC_AMM.name, logo: null, tvl: classic });
    for (const p of PROTOCOLS) {
      const mine = ours.get(p.slug)?.get(day);
      const theirs = llama.get(p.slug)?.get(day);
      const row = { slug: p.slug, name: p.name, logo: protocolLogo(p.slug) };
      if (mine !== undefined) {
        if (mine > MIN_TVL) rows.push({ ...row, tvl: mine });
      } else if (theirs && theirs > MIN_TVL) rows.push({ ...row, tvl: theirs, llama: true });
    }
    if (!rows.length) continue;
    rows.sort((a, b) => b.tvl - a.tvl);
    breakdown[day] = rows;
    points.push({ date: day * 86400, tvl: rows.reduce((sum, r) => sum + r.tvl, 0) });
  }
  return { points: points.length > 1 ? points : null, breakdown };
}
