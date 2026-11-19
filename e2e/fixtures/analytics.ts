import { createHash } from "node:crypto";
import {
  Address,
  Asset,
  Networks,
  StrKey,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { ACCOUNT, ISSUER, TX, WASM_HASH, codeEntry } from "./stellar";
import {
  INDEXED_LEDGER,
  MAINNET_XLM_CONTRACT,
  PRICE_USDC,
  PRICE_USDC_CONTRACT,
  SOROSWAP_PAIR,
  CLASSIC_POOL_ADDRESS,
  indexedClassicPool,
  indexedSoroswapPair,
  indexedSoroswapBalances,
} from "./indexer";

// Synthetic wire records, never live evidence. No application pricing or
// adapter helpers are used to calculate these inputs or the spec's answers.
export const utcDay = (offset = 0) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
export const STABLE_ASSET = `USDQ:${ISSUER}`;
export const RWA_ASSET = `BOND:${ISSUER}`;
export const STABLE_SAC = new Asset("USDQ", ISSUER).contractId(Networks.PUBLIC);
export const RWA_SAC = new Asset("BOND", ISSUER).contractId(Networks.PUBLIC);
export const STANDARD_TOKEN = StrKey.encodeContract(Buffer.alloc(32, 51));
export const INCOMPLETE_TOKEN = StrKey.encodeContract(Buffer.alloc(32, 52));
export const CUSTOM_TOKEN = StrKey.encodeContract(Buffer.alloc(32, 53));
export const AQUARIUS_POOL = StrKey.encodeContract(Buffer.alloc(32, 54));
export const MISSING_POOL = "b1".repeat(32);
export const UNAVAILABLE_POOL = "b2".repeat(32);
export const UNPRICED_POOL = "b3".repeat(32);
export const QUIET_POOL = "b4".repeat(32);
export const UNSUPPORTED_POOL = StrKey.encodeContract(Buffer.alloc(32, 55));

// 1,200 holders in the aggregate; the database retains more than the top 100.
// Top holder: 25,000 / 10,000,000 tokens = 0.25%. Rank 101 must never be drawn.
export const allHolders = Array.from({ length: 125 }, (_, i) => ({
  rank: i + 1,
  holder:
    i === 0
      ? ACCOUNT
      : StrKey.encodeEd25519PublicKey(
          createHash("sha256").update(`d4-holder-${i}`).digest(),
        ),
  balance: String(BigInt(25_000 - i * 100) * 10_000_000n),
}));
// Supply exceeds the entire ranked list; the remaining holders share the rest.
export const assetSummary = (asset: string) => ({
  asset,
  holders: 1200,
  supply: "100000000000000",
  on_offers: "0",
});
// Standard Soroban token uses 9 decimals: 25,000 of 10,000,000 = 0.25%.
export const tokenSummary = (asset: string) => ({
  asset,
  holders: 1200,
  supply: "10000000000000000",
  complete: asset !== INCOMPLETE_TOKEN,
});
export const tokenHolders = allHolders.map((h) => ({
  ...h,
  balance: String(BigInt(h.balance) * 100n),
}));
export const tokenIds = [STANDARD_TOKEN, INCOMPLETE_TOKEN, CUSTOM_TOKEN];
export const holderAssets = ["native", STABLE_ASSET, RWA_ASSET, ...tokenIds];

const topic = (address: string) => JSON.stringify({ address });
const vec = (a: string, b: string) =>
  JSON.stringify({ vec: [{ i128: a }, { i128: b }] });
// Aquarius concentrated pool: tick 0 -> 1 USDC per XLM at its own price.
// Both assets have reliable prices: 100,000 XLM * $0.20 + 100,000 USDC = $120k.
export const aquarius = {
  contract_id: AQUARIUS_POOL,
  soroswap: 0,
  concentrated: 1,
  tokens: [topic(MAINNET_XLM_CONTRACT), topic(PRICE_USDC_CONTRACT)],
  reserves: vec("1000000000000", "1000000000000"),
  state: JSON.stringify({
    vec: [
      { u256: "79228162514264337593543950336" },
      { i32: 0 },
      { i128: "1000000" },
    ],
  }),
  fee_ratio: 0.001,
};
export const sorobanPools = [indexedSoroswapPair, aquarius];
export const sorobanBalances = [
  indexedSoroswapBalances,
  {
    holder: AQUARIUS_POOL,
    balances: [
      ["native", "1000000000000"],
      [PRICE_USDC, "1000000000000"],
    ],
  },
];
export const classicPools = [
  indexedClassicPool,
  {
    ...indexedClassicPool,
    pool_id: UNPRICED_POOL,
    asset_a: STABLE_ASSET,
    asset_b: RWA_ASSET,
  },
  { ...indexedClassicPool, pool_id: QUIET_POOL },
];

// Aggregated swaps value ONE side, irrespective of the number of operations.
// Classic: $200; Soroswap: $600; Aquarius: $100. Total = $900, fees = $2.50.
export const poolTrades = [
  {
    pool: CLASSIC_POOL_ADDRESS,
    asset_in: "native",
    asset_out: PRICE_USDC,
    amount_in: "10000000000",
    amount_out: "2000000000",
    trades: "3",
  },
  {
    pool: SOROSWAP_PAIR,
    asset_in: "native",
    asset_out: PRICE_USDC,
    amount_in: "30000000000",
    amount_out: "6000000000",
    trades: "2",
  },
  {
    pool: AQUARIUS_POOL,
    asset_in: "native",
    asset_out: PRICE_USDC,
    amount_in: "5000000000",
    amount_out: "1000000000",
    trades: "1",
  },
];
export const dailyTrades = poolTrades.flatMap((row) =>
  [-1, 0].map((offset) => ({ ...row, day: utcDay(offset) })),
);

export function poolActivity(pool: string) {
  if (![CLASSIC_POOL_ADDRESS, SOROSWAP_PAIR, AQUARIUS_POOL].includes(pool))
    return [];
  return [
    // Refunded input: 120 - 20 = 100 XLM, received 20 USDC.
    {
      legs: [
        ["native", "1200000000"],
        ["native", "-200000000"],
        [PRICE_USDC, "-200000000"],
      ],
      tx_index: 3,
      tx_hash: TX.payment,
    },
    {
      legs: [
        ["native", "5000000000"],
        [PRICE_USDC, "1000000000"],
      ],
      tx_index: 2,
      tx_hash: TX.soroban,
    },
    {
      legs: [
        ["native", "-2500000000"],
        [PRICE_USDC, "-500000000"],
      ],
      tx_index: 1,
      tx_hash: TX.feeBump,
    },
    // Single-sided rewards are not trades or liquidity deposits.
    { legs: [["native", "10000000"]], tx_index: 0, tx_hash: TX.failed },
  ].map((row) => ({
    ...row,
    ledger_sequence: INDEXED_LEDGER,
    op_index: 0,
    op_time: `${utcDay()} 12:00:00`,
    op_counterparty: ACCOUNT,
    op_pool: pool,
  }));
}

export const llamaTvls: Record<string, number> = {
  soroswap: 500_000,
  "aquarius-stellar": 100_000,
  blend: 9_000_000,
};
export const llamaVolumes = [
  { name: "Soroswap", total24h: 750 },
  { name: "Aquarius", total24h: 125 },
];

export function instanceHash(id: string) {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(id).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
  return createHash("sha256").update(key.toXDR()).digest("hex");
}

export function tokenInstance(id: string) {
  const sac = id === STABLE_SAC || id === RWA_SAC;
  const symbol = id === STABLE_SAC ? "USDQ" : id === RWA_SAC ? "BOND" : "NINE";
  const storage =
    id === CUSTOM_TOKEN
      ? []
      : [
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("METADATA"),
            val: nativeToScVal({
              decimal: sac ? 7 : 9,
              name: sac ? `${symbol}:${ISSUER}` : symbol,
              symbol,
            }),
          }),
        ];
  return {
    val_xdr: xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({
        executable: sac
          ? xdr.ContractExecutable.contractExecutableStellarAsset()
          : xdr.ContractExecutable.contractExecutableWasm(WASM_HASH),
        storage,
      }),
    ).toXDR("base64"),
    live_until_ledger: INDEXED_LEDGER + 10000,
    last_modified_ledger: INDEXED_LEDGER,
  };
}
// The WASM fixture provides a real contractspecv0 section. These tests exercise
// indexed token metadata/holders, not execution of the contract's functions.
export const tokenWasm = xdr.LedgerEntryData.fromXDR(codeEntry, "base64")
  .contractCode()
  .code()
  .toString("base64");
