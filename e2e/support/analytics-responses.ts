import { Address, xdr } from "@stellar/stellar-sdk";
import {
  allHolders,
  assetSummary,
  tokenSummary,
  tokenHolders,
  tokenIds,
  holderAssets,
  STABLE_ASSET,
  STABLE_SAC,
  RWA_SAC,
  STANDARD_TOKEN,
  INCOMPLETE_TOKEN,
  CUSTOM_TOKEN,
  AQUARIUS_POOL,
  MISSING_POOL,
  UNAVAILABLE_POOL,
  classicPools,
  sorobanPools,
  sorobanBalances,
  poolTrades,
  dailyTrades,
  poolActivity,
  llamaTvls,
  llamaVolumes,
  instanceHash,
  tokenInstance,
  tokenWasm,
  stableSnapshots,
  stableDayFills,
  utcDay,
} from "../fixtures/analytics";
import { ACCOUNT, ISSUER, WASM_HASH } from "../fixtures/stellar";
import {
  CLASSIC_POOL_ADDRESS,
  SOROSWAP_PAIR,
  MAINNET_XLM_INSTANCE_KEY_HASH,
} from "../fixtures/indexer";
import type { FixtureResponse } from "./indexer-responses";

const enabled = () => process.env.E2E_ANALYTICS_POOLS_AND_HOLDERS === "1";
const ok = (body: unknown): FixtureResponse => ({ status: 200, body });
const rows = (values: unknown[]): FixtureResponse => ({
  status: 200,
  body: values.map((row) => JSON.stringify(row)).join("\n"),
  contentType: "application/x-ndjson",
});
const includes = (raw: string | null, id: string) =>
  Boolean(raw?.includes(`'${id}'`));
const selectedPools = (url: URL) =>
  sorobanPools.filter((p) =>
    includes(url.searchParams.get("param_ids"), p.contract_id),
  );

// Called only AFTER the shared dispatcher validates method, authorization,
// database and response format. Undefined goes through the strict base corpus.
export function analyticsClickhouse(
  url: URL,
  sql: string,
): FixtureResponse | undefined {
  if (!enabled()) return;
  const param = (key: string) => url.searchParams.get(`param_${key}`);
  const asset = param("asset");
  if (sql.includes("FROM assets") && sql.includes("WHERE asset =")) {
    if (holderAssets.includes(asset ?? ""))
      return rows([
        tokenIds.includes(asset!) ? tokenSummary(asset!) : assetSummary(asset!),
      ]);
    if ([STABLE_SAC, RWA_SAC, SOROSWAP_PAIR].includes(asset ?? ""))
      return rows([]);
  }
  if (sql.includes("FROM top_holders") && holderAssets.includes(asset ?? "")) {
    if (param("limit") !== "100")
      throw new Error(
        "Analytics: pools and holders requires a top-100 holder query",
      );
    return rows(
      (tokenIds.includes(asset!) ? tokenHolders : allHolders).slice(0, 100),
    );
  }
  if (sql.includes("FROM transfers_by_account") && param("holders")) {
    if (!holderAssets.includes(asset ?? "") || param("days") !== "30")
      throw new Error("Unexpected holder-link query");
    return rows([
      { a: allHolders[0].holder, b: allHolders[1].holder, transfers: "5" },
    ]);
  }
  if (
    sql.includes("FROM state_sac_balances") &&
    sql.includes("startsWith(holder, 'C')")
  ) {
    return rows(sorobanPools.map((p) => ({ holder: p.contract_id })));
  }
  if (sql.includes("FROM state_sac_balances") && sql.includes("holder IN")) {
    return rows(
      sorobanBalances.filter((p) => includes(param("ids"), p.holder)),
    );
  }
  if (sql.includes("FROM events") && sql.includes("HAVING soroswap"))
    return rows(selectedPools(url));
  if (sql.includes("FROM events") && sql.includes("AS state")) {
    return rows(
      selectedPools(url).map((p) => ({
        contract_id: p.contract_id,
        reserves: p.reserves,
        state: p.state,
        ...(sql.includes("AS day") && { day: utcDay(-1) }),
      })),
    );
  }
  if (sql.includes("GROUP BY pool, asset_in, asset_out")) {
    return rows(poolTrades.filter((p) => includes(param("pools"), p.pool)));
  }
  if (
    sql.includes("GROUP BY day, asset_in, asset_out") ||
    sql.includes("GROUP BY pool, day, asset_in, asset_out")
  ) {
    return rows(
      dailyTrades.filter(
        (p) =>
          includes(param("pools"), p.pool) &&
          (!param("from") || p.day === param("from")),
      ),
    );
  }
  if (sql.includes("AS op_counterparty")) {
    if (param("pool")) return rows(poolActivity(param("pool")!));
    return rows(
      [SOROSWAP_PAIR, AQUARIUS_POOL]
        .filter((id) => includes(param("pools"), id))
        .flatMap(poolActivity),
    );
  }
  if (
    sql.includes("FROM transactions") &&
    sql.includes("tx_index) IN") &&
    !param("contract")
  ) {
    return rows(
      poolActivity(CLASSIC_POOL_ADDRESS).map(
        ({ ledger_sequence, tx_index, tx_hash }) => ({
          ledger_sequence,
          tx_index,
          tx_hash,
        }),
      ),
    );
  }
  if (sql.includes("FROM events") && param("contract")) {
    if (
      ![
        STANDARD_TOKEN,
        INCOMPLETE_TOKEN,
        CUSTOM_TOKEN,
        STABLE_SAC,
        RWA_SAC,
      ].includes(param("contract")!)
    )
      throw new Error("Unknown token events fixture");
    return rows([]);
  }
  if (sql.includes("FROM contract_creations") && param("contract"))
    return rows([]);
  if (sql.includes("FROM trades") && sql.includes("GROUP BY hour"))
    return rows([]);
  // History section: USDQ has daily snapshots, and every day's fills
  // against XLM and USDC hold the same USDQ trades.
  if (sql.includes("FROM asset_snapshots") && sql.includes("computed_at"))
    return rows(asset === STABLE_ASSET ? stableSnapshots : []);
  if (sql.includes("FROM trades") && param("counters"))
    return rows(stableDayFills);
  if (sql.includes("FROM asset_snapshots")) return rows([]);
  // Price decoration of the synthetic stablecoin/RWA has no market yet.
  if (sql.includes("FROM state_offers")) return rows([]);
  // A holder click renders the actual account route, which can fall back to
  // its known Horizon record. Account history is explicitly empty here.
  if (sql.includes("FROM account_activity") && param("account") === ACCOUNT)
    return rows([]);
}

export function analyticsApi(url: URL): FixtureResponse | undefined {
  if (!enabled()) return;
  if (
    url.pathname === "/liquidity_pools" &&
    url.searchParams.get("select")?.includes("fee_bp")
  ) {
    const selector = url.searchParams.get("pool_id");
    if (selector === `eq.${UNAVAILABLE_POOL}`)
      return { status: 503, body: { error: "Synthetic indexer outage" } };
    if (selector === `eq.${MISSING_POOL}`) return ok([]);
    const found = classicPools.filter(
      (p) =>
        selector === `eq.${p.pool_id}` ||
        selector?.slice(3, -1).split(",").includes(p.pool_id),
    );
    if (found.length) return ok(found);
  }
  if (
    url.pathname === "/rpc/order_book" &&
    holderAssets.includes(url.searchParams.get("base") ?? "")
  )
    return ok([]);
  if (url.pathname === "/contract_data") {
    const ids = [...tokenIds, STABLE_SAC, RWA_SAC];
    const id = ids.find(
      (id) => url.searchParams.get("key_hash") === `eq.${instanceHash(id)}`,
    );
    if (id) return ok([tokenInstance(id)]);
    if (ids.some((id) => url.searchParams.get("contract_id") === `eq.${id}`))
      return ok([]);
    if (
      url.searchParams.get("key_hash") === `eq.${MAINNET_XLM_INSTANCE_KEY_HASH}`
    )
      return ok([]);
  }
  if (
    url.pathname === "/contract_wasm" &&
    url.searchParams.get("code_hash") === `eq.${WASM_HASH.toString("hex")}`
  )
    return ok([{ wasm: tokenWasm }]);
  if (
    ["/accounts", "/trustlines", "/data_entries"].includes(url.pathname) &&
    [ACCOUNT, ISSUER].some(
      (id) => url.searchParams.get("account_id") === `eq.${id}`,
    )
  )
    return ok([]);
}

export function analyticsPublic(
  url: URL,
  method: string,
  rawBody?: unknown,
): FixtureResponse | undefined {
  if (!enabled()) return;
  if (
    method === "GET" &&
    ["https://horizon.stellar.org", "https://horizon.e2e.invalid"].includes(
      url.origin,
    ) &&
    url.pathname === `/accounts/${ACCOUNT}/operations`
  ) {
    return ok({
      _links: {
        self: { href: url.href },
        next: { href: url.href },
        prev: { href: url.href },
      },
      _embedded: { records: [] },
    });
  }
  if (method === "POST" && url.origin === "https://rpc.e2e.invalid") {
    const request = (
      typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody
    ) as {
      id: string | number;
      method: string;
      params?: { keys?: string[] };
    };
    if (request.method === "getLedgerEntries" && request.params?.keys?.length) {
      const keys = request.params.keys.map((key) => ({
        key,
        decoded: xdr.LedgerKey.fromXDR(key, "base64"),
      }));
      if (
        keys.every(
          ({ decoded }) =>
            decoded.switch().name === "contractData" &&
            decoded.contractData().key().switch().name ===
              "scvLedgerKeyContractInstance" &&
            [STABLE_SAC, RWA_SAC].includes(
              Address.fromScAddress(
                decoded.contractData().contract(),
              ).toString(),
            ),
        )
      ) {
        const entries = keys.map(({ key, decoded }) => {
          const data = decoded.contractData();
          const instance = tokenInstance(
            Address.fromScAddress(data.contract()).toString(),
          );
          return {
            key,
            lastModifiedLedgerSeq: 58123456,
            liveUntilLedgerSeq: 58133456,
            xdr: xdr.LedgerEntryData.contractData(
              new xdr.ContractDataEntry({
                ext: new xdr.ExtensionPoint(0),
                contract: data.contract(),
                key: data.key(),
                durability: data.durability(),
                val: xdr.ScVal.fromXDR(instance.val_xdr, "base64"),
              }),
            ).toXDR("base64"),
          };
        });
        return ok({
          jsonrpc: "2.0",
          id: request.id,
          result: { latestLedger: 58123456, entries },
        });
      }
    }
  }
  if (method !== "GET" || url.origin !== "https://api.llama.fi") return;
  const slug = url.pathname.split("/").at(-1)!;
  if (url.pathname.startsWith("/tvl/") && slug in llamaTvls)
    return ok(llamaTvls[slug]);
  if (url.pathname === "/overview/dexs/stellar")
    return ok({ protocols: llamaVolumes });
  if (url.pathname.startsWith("/protocol/") && slug in llamaTvls)
    return ok({
      tvl: [-1, 0].map((offset) => ({
        date: Date.parse(utcDay(offset)) / 1000,
        totalLiquidityUSD: llamaTvls[slug],
      })),
    });
  if (
    url.pathname.startsWith("/summary/dexs/") &&
    ["soroswap", "aquarius-stellar"].includes(slug)
  )
    return ok({
      total24h: slug === "soroswap" ? 750 : 125,
      totalDataChart: [-1, 0].map((offset) => [
        Date.parse(utcDay(offset)) / 1000,
        slug === "soroswap" ? 750 : 125,
      ]),
    });
}
