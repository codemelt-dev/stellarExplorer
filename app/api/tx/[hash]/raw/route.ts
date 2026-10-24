import type { NextRequest } from "next/server";
import { getTransactionRaw, NotFoundError } from "@/lib/stellar/transactions";

// The XDR tab of an indexer-served transaction: the indexer keeps no XDR, so
// this asks Horizon, only when someone opens the tab. Follows the network
// cookie like the pages do
export async function GET(_request: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  // counted with the [indexer] lines: Horizon is only asked when XDR is opened
  console.info(`[horizon] tx raw ${hash.slice(0, 8)}`);
  try {
    const raw = await getTransactionRaw(hash);
    // a closed transaction never changes
    return Response.json(raw, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    const status = error instanceof NotFoundError ? 404 : 503;
    return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  }
}
