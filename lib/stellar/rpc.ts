import "server-only";
import { cache } from "react";
import { activeNetwork } from "./network";

// Horizon stopped returning result_meta_xdr, so soroban return values and
// events come from RPC instead. RPC only keeps ~7 days of history
async function rpcCall<T>(method: string, params: unknown): Promise<T | null> {
  const url = (await activeNetwork()).rpcUrl;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: T };
    return json.result ?? null;
  } catch {
    return null;
  }
}

interface RpcGetTransactionResult {
  status: "SUCCESS" | "NOT_FOUND" | "FAILED";
  resultMetaXdr?: string;
}

/** Base64 TransactionMeta for a tx, or null (not found / RPC down / too old). */
export const getTransactionMetaXdr = cache(
  async (hash: string): Promise<string | null> => {
    const result = await rpcCall<RpcGetTransactionResult>("getTransaction", {
      hash,
    });
    if (!result || result.status === "NOT_FOUND") return null;
    return result.resultMetaXdr ?? null;
  },
);
