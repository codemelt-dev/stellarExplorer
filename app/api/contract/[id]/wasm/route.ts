import { getContractWasm } from "@/lib/stellar/contracts";

// raw on demand: the contract's compiled code as a file. Goes through the
// server because the indexer needs a login the browser must never see
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = await getContractWasm(id);
  if (!code) {
    return new Response("No Wasm for this contract.", { status: 404 });
  }
  return new Response(new Uint8Array(code.wasm), {
    headers: {
      "Content-Type": "application/wasm",
      "Content-Disposition": `attachment; filename="${code.hash}.wasm"`,
      // the answer depends on the network cookie, and a contract can swap its code
      "Cache-Control": "private, no-store",
    },
  });
}
