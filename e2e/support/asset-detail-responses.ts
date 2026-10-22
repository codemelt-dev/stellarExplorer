import { Address, xdr } from "@stellar/stellar-sdk";
import { ISSUED_ASSET } from "../fixtures/asset-detail";
import { LEDGER } from "../fixtures/stellar";

interface FixtureResponse {
  status: number;
  body: unknown;
}

interface RpcRequest {
  id: number | string;
  method: string;
  params?: { keys?: string[] };
}

/**
 * The asset page optionally checks whether its Stellar Asset Contract has been
 * deployed. This fixture models an undeployed contract without making the
 * otherwise valid asset page fail on an unrecognised RPC lookup.
 */
export function assetDetailResponse(
  request: RpcRequest,
): FixtureResponse | undefined {
  if (request.method !== "getLedgerEntries" || !request.params?.keys?.length) {
    return undefined;
  }

  const ledgerKeys = request.params.keys.map((key) =>
    xdr.LedgerKey.fromXDR(key, "base64"),
  );
  const requestsAssetContract = ledgerKeys.some(
    (ledgerKey) =>
      ledgerKey.switch().name === "contractData" &&
      Address.fromScAddress(ledgerKey.contractData().contract()).toString() ===
        ISSUED_ASSET.contractId,
  );

  if (!requestsAssetContract) return undefined;

  const isExpectedBatch = ledgerKeys.every(
    (ledgerKey) =>
      ledgerKey.switch().name === "contractData" &&
      Address.fromScAddress(ledgerKey.contractData().contract()).toString() ===
        ISSUED_ASSET.contractId &&
      ledgerKey.contractData().key().switch().name ===
        "scvLedgerKeyContractInstance",
  );

  // Let the strict generic dispatcher reject mixed or unexpected batches.
  if (!isExpectedBatch) return undefined;

  return {
    status: 200,
    body: {
      jsonrpc: "2.0",
      id: request.id,
      result: { entries: [], latestLedger: LEDGER },
    },
  };
}
