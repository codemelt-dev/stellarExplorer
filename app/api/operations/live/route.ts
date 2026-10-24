import { getLiveOperations } from "@/lib/stellar/transactions";

// the home page's live operations on mainnet. The indexer needs a login the
// browser must never see, so the browser polls here and we forward the rows.
// Always mainnet
export async function GET() {
  const ops = await getLiveOperations();
  if (!ops) {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(ops, {
    // every viewer asks the same URL, so the CDN answers them all with one
    // indexer call per ledger
    headers: { "Cache-Control": "public, max-age=0, s-maxage=5" },
  });
}
