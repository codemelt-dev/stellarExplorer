import type { NextRequest } from "next/server";
import { parseAssetId } from "@/lib/stellar/assetId";
import { getAssetMarket } from "@/lib/stellar/assetMarket";

// The asset page's market section. The browser asks here after the page has
// rendered, so crawlers, which don't run scripts, never set off the week of
// trades it reads. Follows the network cookie like the pages do
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = parseAssetId(decodeURIComponent(id));
  if (!identity || identity.kind === "contract") {
    return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const market = await getAssetMarket(identity);
  if (!market) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(market, { headers: { "Cache-Control": "private, max-age=300" } });
}
