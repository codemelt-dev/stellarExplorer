import type { NextRequest } from "next/server";
import { getLiveLedgers } from "@/lib/stellar/ledgers";

// the live pulse on mainnet. The indexer needs a login the browser must never
// see, so the browser polls here and we forward the rows. Always mainnet
export async function GET(request: NextRequest) {
  const after = Number(request.nextUrl.searchParams.get("after"));
  const rows = await getLiveLedgers(Number.isSafeInteger(after) && after > 0 ? after : null);
  if (!rows) {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(rows, {
    // every viewer polls the same ?after= at about the same moment, so the CDN
    // answers all of them with one indexer call per second
    headers: { "Cache-Control": "public, max-age=0, s-maxage=1" },
  });
}
