import "server-only";
import { zstdDecompressSync } from "node:zlib";
import { cache } from "react";
import { activeNetworkId } from "./network";
import { transactionMetaFromLedger } from "./xdrDecode";

// SDF's public ledger archive on AWS, pubnet only: one zstd file per ledger,
// 64,000 ledgers per partition, keys reversed so the newest sorts first (SEP-54)
const ARCHIVE =
  "https://aws-public-blockchain.s3.us-east-2.amazonaws.com/v1.1/stellar/ledgers/pubnet";

function ledgerKey(sequence: number): string {
  const hex8 = (n: number) => n.toString(16).toUpperCase().padStart(8, "0");
  const start = sequence - (sequence % 64000);
  return `${hex8(0xffffffff - start)}--${start}-${start + 63999}/${hex8(0xffffffff - sequence)}--${sequence}.xdr.zst`;
}

/**
 * Base64 TransactionMeta for a tx, read from its ledger in the archive. Null on
 * testnet, when the ledger isn't archived yet (it trails the network by a few
 * seconds), or when S3 is unreachable.
 */
export const getArchivedMetaXdr = cache(
  async (ledger: number, hash: string): Promise<string | null> => {
    if ((await activeNetworkId()) !== "mainnet") return null;
    try {
      const res = await fetch(`${ARCHIVE}/${ledgerKey(ledger)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const batch = zstdDecompressSync(Buffer.from(await res.arrayBuffer()));
      return transactionMetaFromLedger(batch, hash);
    } catch {
      return null;
    }
  },
);
