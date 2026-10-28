import { createHash } from "node:crypto";
import { Address, Asset, Networks, xdr } from "@stellar/stellar-sdk";
import { ACCOUNT, ISSUER, LEDGER } from "./stellar";

export const INDEXER_CLICKHOUSE = "https://clickhouse.indexer.e2e.invalid";
export const INDEXER_API = "https://api.indexer.e2e.invalid";
export const INDEXER_USER = "e2e-indexer-user";
export const INDEXER_PASSWORD = "e2e-indexer-password";
export const INDEXER_AUTHORIZATION =
  "Basic " +
  Buffer.from(`${INDEXER_USER}:${INDEXER_PASSWORD}`).toString("base64");

export const INDEXED_LEDGER = 58_123_456;
export const INDEXED_LEDGER_HASH = "ab".repeat(32);
export const INDEXED_TX_HASH = "cd".repeat(32);
export const MAINNET_XLM_CONTRACT = Asset.native().contractId(Networks.PUBLIC);
export const INDEXER_UNAVAILABLE_LEDGER = LEDGER;
export const INDEXER_MISSING_LEDGER = 999_999;
export const MISSING_INDEXED_ASSET = `ZZZ:${ISSUER}`;

const mainnetXlmInstanceKey = xdr.LedgerKey.contractData(
  new xdr.LedgerKeyContractData({
    contract: new Address(MAINNET_XLM_CONTRACT).toScAddress(),
    key: xdr.ScVal.scvLedgerKeyContractInstance(),
    durability: xdr.ContractDataDurability.persistent(),
  }),
);
export const MAINNET_XLM_INSTANCE_KEY_HASH = createHash("sha256")
  .update(mainnetXlmInstanceKey.toXDR())
  .digest("hex");

export const indexedLedger = {
  sequence: INDEXED_LEDGER,
  ledger_hash: INDEXED_LEDGER_HASH,
  closed_ts: 1_788_264_000,
  tx_count: 3,
  failed_tx_count: 1,
  op_count: 7,
  base_fee: 100,
  protocol_version: 23,
};

export const indexedLedgerTransaction = {
  tx_hash: INDEXED_TX_HASH,
  successful: 1,
  source_account: ACCOUNT,
  fee_charged: "200",
  op_count: 2,
};

export const indexedXlm = {
  asset: "native",
  holders: 7_654_321,
  supply: "500000000000000",
};

export const indexedXlmHolders = [
  { rank: 1, holder: ACCOUNT, balance: "125000000000000" },
  { rank: 2, holder: ISSUER, balance: "75000000000000" },
];

// the two top holders moved XLM between each other, so they form one cluster
export const indexedXlmHolderLinks = [{ a: ACCOUNT, b: ISSUER, transfers: "3" }];

export const MISSING_INDEXED_ASSET_CODE = "ZZZ";
