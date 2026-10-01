import { Suspense } from "react";
import { getXlmMarket } from "@/lib/stellar/market";
import { NetworkVitals } from "@/components/live/NetworkVitals";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { ThemeToggle } from "./ThemeToggle";

// thin strip above the header: market + live network vitals left, settings right. Scrolls away
export function TopBar() {
  return (
    <div className="border-b border-border/50 bg-background text-xs">
      <div className="mx-auto flex h-11 w-full max-w-300 items-center gap-4 px-4 sm:px-6">
        <Suspense fallback={<span className="h-3 w-24 animate-pulse rounded bg-surface-2" />}>
          <XlmPrice />
        </Suspense>
        <NetworkVitals />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <NetworkSwitcher />
          <ThemeToggle />
        </span>
      </div>
    </div>
  );
}

async function XlmPrice() {
  const xlm = await getXlmMarket();
  if (!xlm) return null;
  const up = xlm.change24h >= 0;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums" title="XLM price, mainnet, via CoinGecko">
      <span className="text-dim">XLM</span>
      <span className="font-medium">${xlm.priceUsd.toFixed(4)}</span>
      <span className={up ? "text-ok" : "text-fail"}>
        {up ? "+" : ""}
        {xlm.change24h.toFixed(2)}%
      </span>
    </span>
  );
}
