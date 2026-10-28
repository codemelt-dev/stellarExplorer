// Prices from our own liquidity pools: an asset's price in XLM from its
// deepest XLM pool, XLM in USD from the XLM / Circle USDC pool. Every classic
// asset has 7 decimals, so a reserve ratio is the price as is

export const USDC = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

/** Thinner pools are too easy to push around to quote from. */
export const MIN_DEPTH_XLM = 1_000;

const STROOPS = 10_000_000;

export interface PricePool {
  pool_id: string;
  /** "native" or "CODE:ISSUER"; a classic pool sorts native first. */
  asset_a: string;
  asset_b: string;
  reserve_a: string;
  reserve_b: string;
}

export type PriceSource = "xlm pool" | "usdc pool" | "order book";

export interface AssetPrice {
  /** Price of one unit in XLM. */
  xlm: number;
  /** Null when XLM itself has no USD price. */
  usd: number | null;
  source: PriceSource;
  /** The pool quoted from, when it came from one. */
  poolId: string | null;
  /** XLM on the quoted side, how much it would take to move the price. */
  depthXlm: number | null;
}

export interface PriceBook {
  /** USD per XLM, null when the USDC pool is missing or empty. */
  xlmUsd: number | null;
  /** The XLM / USDC pool XLM is priced from. */
  xlmPoolId: string | null;
  assets: Map<string, AssetPrice>;
}

// price and depth are in units of the quote asset
interface Quote {
  price: number;
  poolId: string;
  depth: number;
}

const units = (stroops: string) => Number(stroops) / STROOPS;

/** For each asset, the quote from its deepest pool against `quote`, in units of `quote`. */
function deepestQuotes(pools: PricePool[], quote: string): Map<string, Quote> {
  const best = new Map<string, Quote>();
  for (const p of pools) {
    const quoteFirst = p.asset_a === quote;
    if (!quoteFirst && p.asset_b !== quote) continue;
    const asset = quoteFirst ? p.asset_b : p.asset_a;
    const quoteReserve = units(quoteFirst ? p.reserve_a : p.reserve_b);
    const assetReserve = units(quoteFirst ? p.reserve_b : p.reserve_a);
    if (!(quoteReserve > 0) || !(assetReserve > 0)) continue;
    const prev = best.get(asset);
    if (prev && prev.depth >= quoteReserve) continue;
    best.set(asset, { price: quoteReserve / assetReserve, poolId: p.pool_id, depth: quoteReserve });
  }
  return best;
}

/** Prices for every asset with a deep enough pool against XLM or USDC. */
export function buildPriceBook(pools: PricePool[]): PriceBook {
  const vsXlm = deepestQuotes(pools, "native");
  const usdcPool = vsXlm.get(USDC);
  // the USDC pool's XLM per USDC, inverted
  const xlmUsd = usdcPool && usdcPool.depth >= MIN_DEPTH_XLM ? 1 / usdcPool.price : null;

  const assets = new Map<string, AssetPrice>();
  if (xlmUsd !== null) {
    assets.set("native", {
      xlm: 1,
      usd: xlmUsd,
      source: "usdc pool",
      poolId: usdcPool!.poolId,
      depthXlm: usdcPool!.depth,
    });
    // assets with no XLM pool can still have a USDC one, worth its USDC side in XLM
    for (const [asset, q] of deepestQuotes(pools, USDC)) {
      const depthXlm = q.depth / xlmUsd;
      if (asset === "native" || depthXlm < MIN_DEPTH_XLM) continue;
      assets.set(asset, { xlm: q.price / xlmUsd, usd: q.price, source: "usdc pool", poolId: q.poolId, depthXlm });
    }
  }
  for (const [asset, q] of vsXlm) {
    if (q.depth < MIN_DEPTH_XLM) continue;
    const prev = assets.get(asset);
    if (prev && prev.depthXlm !== null && prev.depthXlm > q.depth) continue;
    assets.set(asset, {
      xlm: q.price,
      usd: xlmUsd === null ? null : q.price * xlmUsd,
      source: "xlm pool",
      poolId: q.poolId,
      depthXlm: q.depth,
    });
  }
  return { xlmUsd, xlmPoolId: usdcPool?.poolId ?? null, assets };
}

/** A price from the order book, for assets no pool prices. */
export function orderBookPrice(book: PriceBook, xlm: number): AssetPrice {
  return {
    xlm,
    usd: book.xlmUsd === null ? null : xlm * book.xlmUsd,
    source: "order book",
    poolId: null,
    depthXlm: null,
  };
}

/** An asset priced from a pool at least this deep can value other pools. */
export const ANCHOR_DEPTH_XLM = 100_000;

// how far a side can be trusted to value a pool: XLM, then Circle USDC, then
// deeply priced assets by depth; 0 is not at all
function trust(book: PriceBook, asset: string): number {
  const price = book.assets.get(asset);
  if (!price || price.source === "order book") return 0;
  if (asset === "native") return Infinity;
  if (asset === USDC) return Number.MAX_VALUE;
  return (price.depthXlm ?? 0) >= ANCHOR_DEPTH_XLM ? price.depthXlm! : 0;
}

export interface SideValue {
  xlm: number;
  usd: number | null;
  /** The asset it was valued by. */
  by: string;
}

/**
 * The value of two amounts that are worth the same, as both sides of a
 * constant product pool are at its own price (or both legs of a trade): the
 * more trusted side counted twice, or once with `twice` off. Null when
 * neither side can be trusted, which keeps junk pools from pricing themselves.
 */
export function valueBySide(
  book: PriceBook,
  a: { asset: string; amount: number },
  b: { asset: string; amount: number },
  twice = true,
): SideValue | null {
  const side = trust(book, a.asset) >= trust(book, b.asset) ? a : b;
  if (!trust(book, side.asset)) return null;
  const xlm = (twice ? 2 : 1) * side.amount * book.assets.get(side.asset)!.xlm;
  return { xlm, usd: book.xlmUsd === null ? null : xlm * book.xlmUsd, by: side.asset };
}

/** The assets trusted to value pools, with their XLM prices. */
export function anchorAssets(book: PriceBook): Array<{ asset: string; xlm: number }> {
  return [...book.assets.entries()]
    .filter(([asset]) => trust(book, asset) > 0)
    .map(([asset, price]) => ({ asset, xlm: price.xlm }));
}
