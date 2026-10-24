import type { NextRequest } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { getOlderContractEvents } from "@/lib/stellar/contracts";

// The next older batch of a contract's events, asked for when the browser
// reaches the last page it has. Indexer only; follows the network cookie
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const before = request.nextUrl.searchParams.get("before") ?? "";
  if (!StrKey.isValidContract(id) || !/^\d+-\d+-\d+-\d+$/.test(before)) {
    return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const page = await getOlderContractEvents(id, before);
  if (!page) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  // events older than a cursor never change
  return Response.json(page, { headers: { "Cache-Control": "private, max-age=3600" } });
}
