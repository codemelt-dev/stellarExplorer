import "server-only";
import { getAccountTotals, type AccountTotals } from "./networkStats";

// XLM market data from CoinGecko's free endpoint, plus mainnet account totals.
// Both are mainnet facts, independent of the selected network

export interface XlmMarket {
  priceUsd: number;
  change24h: number;
  marketCapUsd: number;
  volume24hUsd: number;
}

export interface MarketStats {
  xlm: XlmMarket | null;
  accounts: AccountTotals | null;
}

export async function getXlmMarket(): Promise<XlmMarket | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true",
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      stellar?: {
        usd?: number;
        usd_market_cap?: number;
        usd_24h_vol?: number;
        usd_24h_change?: number;
      };
    };
    const s = json.stellar;
    if (!s?.usd) return null;
    return {
      priceUsd: s.usd,
      change24h: s.usd_24h_change ?? 0,
      marketCapUsd: s.usd_market_cap ?? 0,
      volume24hUsd: s.usd_24h_vol ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getMarketStats(): Promise<MarketStats> {
  const [xlm, accounts] = await Promise.all([getXlmMarket(), getAccountTotals()]);
  return { xlm, accounts };
}
