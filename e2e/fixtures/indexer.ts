import { createHash } from "node:crypto";
import { Address, Asset, Networks, StrKey, xdr } from "@stellar/stellar-sdk";
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

// 10M XLM against 2M Circle USDC prices XLM at $0.20
export const PRICE_USDC = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const indexedXlmUsdcPool = {
  pool_id: "a468d41d8e9b8f3c7209651608b74b7db7ac9952dcae0cdf24871d1d9c7b0088",
  asset_a: "native",
  asset_b: PRICE_USDC,
  reserve_a: "100000000000000",
  reserve_b: "20000000000000",
};

export const MISSING_INDEXED_ASSET_CODE = "ZZZ";

// the same XLM / USDC pool as a classic pool: 10M XLM, so $4.0M at $0.20,
// with 3 trades of 1,000 XLM worth $200 in the last day
export const CLASSIC_POOL_ADDRESS = StrKey.encodeLiquidityPool(
  Buffer.from(indexedXlmUsdcPool.pool_id, "hex"),
);
export const indexedClassicPool = {
  ...indexedXlmUsdcPool,
  fee_bp: 30,
  total_shares: "4000000000000",
  trustlines: 832,
  last_modified_ledger: INDEXED_LEDGER,
};
export const indexedClassicPoolTrades = [
  {
    pool: CLASSIC_POOL_ADDRESS,
    asset_in: "native",
    asset_out: PRICE_USDC,
    amount_in: "10000000000",
    amount_out: "2000000000",
    trades: "3",
  },
];

// a Soroswap XLM / USDC pair holding 1M XLM against 200K USDC: $400.0K
export const SOROSWAP_PAIR = StrKey.encodeContract(Buffer.alloc(32, 7));
export const PRICE_USDC_CONTRACT = new Asset(
  "USDC",
  PRICE_USDC.split(":")[1],
).contractId(Networks.PUBLIC);
const pairReserves: Record<string, string> = {
  [MAINNET_XLM_CONTRACT]: "10000000000000",
  [PRICE_USDC_CONTRACT]: "2000000000000",
};
// a pair keeps its tokens sorted by contract id bytes
const pairTokens = Object.keys(pairReserves).sort((a, b) =>
  Buffer.compare(StrKey.decodeContract(a), StrKey.decodeContract(b)),
);
const pairSync = JSON.stringify({
  map: pairTokens.map((token, i) => ({
    key: { symbol: `new_reserve_${i}` },
    val: { i128: pairReserves[token] },
  })),
});
export const indexedSoroswapPair = {
  contract_id: SOROSWAP_PAIR,
  soroswap: 1,
  concentrated: 0,
  tokens: [],
  reserves: pairSync,
  state: "",
  fee_ratio: 0,
};
export const indexedSoroswapReserves = { contract_id: SOROSWAP_PAIR, reserves: pairSync, state: "" };
export const indexedSoroswapTokens = pairTokens.map((token) => ({
  account: SOROSWAP_PAIR,
  contract_id: token,
  n: "40",
}));
export const indexedSoroswapBalances = {
  holder: SOROSWAP_PAIR,
  balances: [
    ["native", pairReserves[MAINNET_XLM_CONTRACT]],
    [PRICE_USDC, pairReserves[PRICE_USDC_CONTRACT]],
  ],
};
export const indexedAssetContracts = [
  { contract_id: MAINNET_XLM_CONTRACT, asset: "native" },
  { contract_id: PRICE_USDC_CONTRACT, asset: PRICE_USDC },
];

// the network's last two complete days, the second one busier
const utcDayAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const networkDay = (daysAgo: number, scale: number) => ({
  day: utcDayAgo(daysAgo),
  transactions: String(5_000_000 * scale),
  failed_transactions: String(1_500_000 * scale),
  soroban_transactions: String(1_400_000 * scale),
  operations: String(10_000_000 * scale),
  operations_by_type: {
    payment: String(4_000_000 * scale),
    manage_sell_offer: String(4_600_000 * scale),
    invoke_host_function: String(1_400_000 * scale),
  },
  active_accounts: String(150_000 * scale),
  // 4,000 XLM, 3,600 of it paid by Soroban transactions
  fees_charged: String(40_000_000_000 * scale),
  new_accounts: String(20_000 * scale),
  new_contracts: String(150 * scale),
  contract_calls: String(1_400_000 * scale),
  token_transfers: String(7_000_000 * scale),
});
export const indexedNetworkDays = [networkDay(2, 1), networkDay(1, 1.2)];
export const indexedSorobanFees = indexedNetworkDays.map((d) => ({
  day: d.day,
  fees: String(Number(d.fees_charged) * 0.9),
}));
// the pair is also the most called contract of the week
export const indexedTopContracts = [{ contract_id: SOROSWAP_PAIR, calls: "1200", callers: "34" }];
