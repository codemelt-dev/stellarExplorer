import type { NextRequest } from "next/server";
import { fromAssetKey, parseAssetId } from "@/lib/stellar/assetId";
import { getAssetHistory } from "@/lib/stellar/assetHistory";

// The History section of asset pages and Soroban token pages. [id] is the
// asset page's id or the token's contract id. Asked for after the page has
// rendered, so crawlers never set off the days of trades it reads
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = decodeURIComponent(id);
  const identity = parseAssetId(key) ?? fromAssetKey(key);
  if (!identity) return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  const history = await getAssetHistory(identity);
  if (!history) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(history, { headers: { "Cache-Control": "private, max-age=300" } });
}
