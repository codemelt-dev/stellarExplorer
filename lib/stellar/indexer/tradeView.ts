import { StrKey } from "@stellar/stellar-sdk";
import { fromAssetKey } from "../assetId";
import type { DexTrade } from "../defi";
import { horizonAmount } from "./opRecord";

export interface ChTrade {
  ledger_sequence: number;
  tx_index: number;
  op_index: number;
  position: number;
  closed_ts: number;
  venue: string;
  seller: string;
  buyer: string;
  sold_asset: string;
  sold_amount: string;
  bought_asset: string;
  bought_amount: string;
}

function side(key: string): { code: string; issuer?: string } {
  const asset = fromAssetKey(key);
  if (asset?.kind === "issued") return { code: asset.code, issuer: asset.issuer };
  return { code: asset?.kind === "native" ? "XLM" : "?" };
}

// the seller is the offer's owner or the pool, and gave the sold asset; the
// buyer sent the operation, so it's the one shown as the trader
export function toDexTrade(t: ChTrade): DexTrade {
  const base = side(t.sold_asset);
  const counter = side(t.bought_asset);
  const sold = Number(t.sold_amount);
  return {
    id: `${t.ledger_sequence}-${t.tx_index}-${t.op_index}-${t.position}`,
    closedAt: new Date(Number(t.closed_ts) * 1000).toISOString(),
    account: t.buyer || null,
    poolId:
      t.venue === "pool" && StrKey.isValidLiquidityPool(t.seller)
        ? StrKey.decodeLiquidityPool(t.seller).toString("hex")
        : null,
    baseAmount: horizonAmount(t.sold_amount),
    baseCode: base.code,
    baseIssuer: base.issuer,
    counterAmount: horizonAmount(t.bought_amount),
    counterCode: counter.code,
    counterIssuer: counter.issuer,
    price: sold > 0 ? Number(t.bought_amount) / sold : 0,
    venue: t.venue === "pool" ? "pool" : "orderbook",
  };
}
