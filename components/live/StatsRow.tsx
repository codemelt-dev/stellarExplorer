"use client";

import { useLedgerStream } from "./LedgerStreamProvider";
import { StatTile, StatTileSkeleton } from "@/components/stats/StatTile";
import { stroopsToLumens } from "@/lib/stellar/amount";
import type { MarketStats } from "@/lib/stellar/market";
import { compactNumber, compactUsd, formatPrice } from "@/lib/format";
import {
  Activity,
  BarChart3,
  Coins,
  DollarSign,
  Landmark,
  Receipt,
  Timer,
  Users,
} from "lucide-react";

/**
 * Market facts (server, mainnet) on the first row, live network facts from
 * the ledger stream on the second. `market` undefined = still loading.
 */
export function StatsRow({ market }: { market?: MarketStats }) {
  const { latest, avgCloseMs } = useLedgerStream();
  const xlm = market?.xlm ?? null;
  const accounts = market?.accounts ?? null;

  const txTotal = latest ? latest.txOk + latest.txFailed : 0;
  const tps =
    latest && avgCloseMs > 0 ? (txTotal / (avgCloseMs / 1000)).toFixed(1) : "–";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {market === undefined ? (
        Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
      ) : (
        <>
          <StatTile
            label="XLM price"
            info="Spot price in USD from CoinGecko, refreshed every 5 minutes."
            icon={DollarSign}
            value={xlm ? formatPrice(xlm.priceUsd) : "–"}
            caption={
              xlm ? (
                <span className={xlm.change24h >= 0 ? "text-ok" : "text-fail"}>
                  {xlm.change24h >= 0 ? "+" : ""}
                  {xlm.change24h.toFixed(2)}% 24h
                </span>
              ) : (
                "Price unavailable"
              )
            }
          />
          <StatTile
            label="Market cap"
            info="Circulating XLM times spot price, from CoinGecko."
            icon={Landmark}
            value={xlm?.marketCapUsd ? compactUsd(xlm.marketCapUsd) : "–"}
            caption="USD"
          />
          <StatTile
            label="24h volume"
            info="XLM traded across tracked exchanges in the last 24 hours, from CoinGecko."
            icon={BarChart3}
            value={xlm?.volume24hUsd ? compactUsd(xlm.volume24hUsd) : "–"}
            caption="All exchanges"
          />
          <StatTile
            label="Total accounts"
            info="Funded accounts on mainnet, updated daily."
            icon={Users}
            value={accounts ? compactNumber(accounts.total) : "–"}
            caption={
              accounts
                ? `+${accounts.newLastDay.toLocaleString("en-US")} last day`
                : "Mainnet"
            }
          />
        </>
      )}

      {!latest ? (
        Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
      ) : (
        <>
          <StatTile
            label="Avg close time"
            info="Average time between ledger closes over the last 60 ledgers."
            icon={Timer}
            value={`${(avgCloseMs / 1000).toFixed(1)}s`}
            caption={`${tps} TPS`}
          />
          <StatTile
            label="Txs in last ledger"
            info="Transactions applied in the newest ledger, successful and failed."
            icon={Activity}
            value={txTotal}
            caption={
              latest.txFailed > 0 ? (
                <>
                  <span className="text-fail">{latest.txFailed} failed</span>
                  {` · ${latest.opCount} ops`}
                </>
              ) : (
                `${latest.opCount} ops`
              )
            }
          />
          <StatTile
            label="Base fee"
            info="Minimum fee per operation. Surge pricing raises it when ledgers are full."
            icon={Receipt}
            value={`${stroopsToLumens(latest.baseFeeStroops)} XLM`}
            caption={`Protocol ${latest.protocol}`}
          />
          <StatTile
            label="Fee pool"
            info="All fees ever paid on this network. They are collected here, not paid to validators."
            icon={Coins}
            value={compactNumber(latest.feePool)}
            caption="XLM"
          />
        </>
      )}
    </div>
  );
}
