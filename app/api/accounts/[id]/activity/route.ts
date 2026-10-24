import type { NextRequest } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { getAccountOperations } from "@/lib/stellar/accounts";
import { NotFoundError } from "@/lib/stellar/transactions";

// "Your activity" on an account page: type and time of the latest 200
// operations. The browser asks here so mainnet reads the indexer, whose login
// it must never see. Follows the network cookie like the pages do
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!StrKey.isValidEd25519PublicKey(id)) {
    return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const page = await getAccountOperations(id, { limit: 200 });
    return Response.json(
      page.records.map((op) => ({ type: op.type, created_at: op.created_at })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof NotFoundError ? 404 : 503;
    return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  }
}
