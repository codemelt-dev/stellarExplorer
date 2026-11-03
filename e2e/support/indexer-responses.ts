import {
  INDEXED_LEDGER,
  INDEXER_MISSING_LEDGER,
  INDEXER_UNAVAILABLE_LEDGER,
  INDEXER_API,
  INDEXER_AUTHORIZATION,
  INDEXER_CLICKHOUSE,
  MAINNET_XLM_INSTANCE_KEY_HASH,
  MISSING_INDEXED_ASSET,
  SOROSWAP_PAIR,
  indexedAssetContracts,
  indexedClassicPool,
  indexedClassicPoolTrades,
  indexedLedger,
  indexedLedgerTransaction,
  indexedXlm,
  indexedXlmHolderLinks,
  indexedXlmHolders,
  indexedSoroswapBalances,
  indexedSoroswapPair,
  indexedSoroswapReserves,
  indexedSoroswapTokens,
  indexedXlmUsdcPool,
  indexedNetworkDays,
  indexedSorobanFees,
  indexedTopContracts,
} from "../fixtures/indexer";

export type RequestHeaders = Record<string, string | string[] | undefined>;
export type FixtureResponse = {
  status: number;
  body: unknown;
  delay?: number;
  contentType?: string;
};

function header(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value;
}

function requireHeader(
  headers: RequestHeaders,
  name: string,
  expected: string,
) {
  const actual = header(headers, name);
  if (actual !== expected) {
    throw new Error(`Invalid indexer ${name} header: ${actual ?? "missing"}`);
  }
}

const utcDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

function clickhouseResponse(
  url: URL,
  method: string,
  body: unknown,
  headers: RequestHeaders,
) {
  if (method !== "POST")
    throw new Error(`ClickHouse requires POST, received ${method}`);
  requireHeader(headers, "authorization", INDEXER_AUTHORIZATION);
  if (url.pathname !== "/query")
    throw new Error(`Unexpected ClickHouse path: ${url.pathname}`);
  if (url.searchParams.get("database") !== "stellar") {
    throw new Error("ClickHouse request omitted database=stellar");
  }
  if (url.searchParams.get("default_format") !== "JSONEachRow") {
    throw new Error("ClickHouse request omitted default_format=JSONEachRow");
  }
  if (typeof body !== "string")
    throw new Error("ClickHouse query body must be SQL text");

  let rows: unknown[];
  if (body.includes("FROM ledgers") && body.includes("sequence <")) {
    if (url.searchParams.get("param_before") !== "4294967295") {
      throw new Error("Recent-ledger query has an unexpected cursor");
    }
    if (url.searchParams.get("param_limit") !== "25") {
      throw new Error("Recent-ledger query has an unexpected limit");
    }
    rows = [indexedLedger];
  } else if (body.includes("FROM ledgers") && body.includes("sequence =")) {
    const sequence = url.searchParams.get("param_sequence");
    if (sequence === String(INDEXED_LEDGER)) {
      rows = [indexedLedger];
    } else if (sequence === String(INDEXER_MISSING_LEDGER)) {
      rows = [];
    } else if (sequence === String(INDEXER_UNAVAILABLE_LEDGER)) {
      return { status: 503, body: { error: "fixture indexer unavailable" } };
    } else {
      throw new Error(
        `Missing indexed-ledger fixture: ${sequence ?? "missing"}`,
      );
    }
  } else if (
    body.includes("FROM transactions") &&
    body.includes("ledger_sequence =")
  ) {
    if (url.searchParams.get("param_sequence") !== String(INDEXED_LEDGER)) {
      throw new Error("Ledger transactions requested for an unknown sequence");
    }
    rows = [indexedLedgerTransaction];
  } else if (body.includes("FROM assets") && body.includes("WHERE asset =")) {
    const asset = url.searchParams.get("param_asset");
    if (asset === "native") rows = [indexedXlm];
    else if (asset === MISSING_INDEXED_ASSET) rows = [];
    else
      throw new Error(`Missing indexed-asset fixture: ${asset ?? "missing"}`);
  } else if (body.includes("FROM top_holders")) {
    if (
      url.searchParams.get("param_asset") !== "native" ||
      url.searchParams.get("param_limit") !== "100"
    ) {
      throw new Error("Top-holder request has unexpected parameters");
    }
    rows = indexedXlmHolders;
  } else if (body.includes("FROM state_liquidity_pools")) {
    // classic pool shortlist
    rows = [{ pool_id: indexedXlmUsdcPool.pool_id }];
  } else if (body.includes("FROM state_sac_balances") && body.includes("startsWith(holder, 'C')")) {
    // contracts holding trusted assets, checked for Soroban pool events
    rows = [{ holder: SOROSWAP_PAIR }];
  } else if (body.includes("FROM state_sac_balances") && body.includes("holder IN")) {
    rows = [indexedSoroswapBalances];
  } else if (body.includes("FROM state_asset_contracts")) {
    rows = indexedAssetContracts;
  } else if (body.includes("SELECT count() AS events FROM events")) {
    rows = [{ events: "120" }];
  } else if (body.includes("FROM daily_stats") && body.includes("operations_by_type")) {
    rows = indexedNetworkDays;
  } else if (body.includes("sumIf(fee_charged, soroban)")) {
    rows = indexedSorobanFees;
  } else if (body.includes("FROM contract_calls") && body.includes("uniq(caller)")) {
    rows = indexedTopContracts;
  } else if (body.includes("AS day FROM ledgers")) {
    // the indexer holds yesterday and today, so pool history has two days
    rows = [utcDay(-1), utcDay(0)].map((day) => ({ day }));
  } else if (body.includes("FROM events") && body.includes("AS day")) {
    // the pair synced once today, to the reserves it still has
    rows = url.searchParams.get("param_ids")?.includes(SOROSWAP_PAIR)
      ? [{ ...indexedSoroswapReserves, day: utcDay(0) }]
      : [];
  } else if (body.includes("FROM transfers_by_account") && body.includes("kind != 'fee'")) {
    // nothing moved in or out of a pool since yesterday
    rows = [];
  } else if (body.includes("FROM events") && body.includes("HAVING soroswap")) {
    rows = url.searchParams.get("param_ids")?.includes(SOROSWAP_PAIR) ? [indexedSoroswapPair] : [];
  } else if (body.includes("FROM events") && body.includes("AS state")) {
    rows = [indexedSoroswapReserves];
  } else if (body.includes("FROM transfers_by_account") && body.includes("count() AS n")) {
    rows = indexedSoroswapTokens;
  } else if (body.includes("GROUP BY pool, asset_in, asset_out")) {
    // the classic pool traded in the last day; the pair, asked with its tokens, didn't
    rows = url.searchParams.has("param_legs") ? [] : indexedClassicPoolTrades;
  } else if (body.includes("GROUP BY day, asset_in, asset_out") || body.includes("AS op_counterparty")) {
    // no daily history or activity for either pool
    rows = [];
  } else if (body.includes("FROM transfers_by_account")) {
    if (
      url.searchParams.get("param_asset") !== "native" ||
      url.searchParams.get("param_days") !== "90"
    ) {
      throw new Error("Holder-link request has unexpected parameters");
    }
    rows = indexedXlmHolderLinks;
  } else if (
    body.includes("FROM state_copy_runs") ||
    body.includes("FROM daily_stats") ||
    body.includes("FROM asset_snapshots") ||
    (body.includes("FROM assets") && body.includes("home_domain != ''"))
  ) {
    // Homepage network stats and top tokens are out of scope: no rows makes
    // them fall back to the empty stellar.expert fixtures.
    rows = [];
  } else {
    throw new Error(
      `Unhandled ClickHouse query: ${body.replace(/\s+/g, " ").slice(0, 180)}`,
    );
  }

  return {
    status: 200,
    body: rows.map((row) => JSON.stringify(row)).join("\n"),
    contentType: "application/x-ndjson",
  } satisfies FixtureResponse;
}

function apiResponse(url: URL, method: string, headers: RequestHeaders) {
  if (method !== "GET")
    throw new Error(`Indexer API requires GET, received ${method}`);
  requireHeader(headers, "authorization", INDEXER_AUTHORIZATION);
  requireHeader(headers, "accept-profile", "api");

  if (url.pathname === "/contract_data") {
    const keyHash = url.searchParams.get("key_hash");
    if (keyHash !== `eq.${MAINNET_XLM_INSTANCE_KEY_HASH}`) {
      throw new Error(`Missing contract-data fixture: ${keyHash ?? "missing"}`);
    }
    if (
      url.searchParams.get("select") !==
      "val_xdr,live_until_ledger,last_modified_ledger"
    ) {
      throw new Error("Contract instance request has an unexpected projection");
    }
    return { status: 200, body: [] } satisfies FixtureResponse;
  }

  if (
    url.pathname === "/liquidity_pools" &&
    url.searchParams.get("select") ===
      "pool_id,asset_a,asset_b,fee_bp,reserve_a,reserve_b,total_shares,trustlines,last_modified_ledger"
  ) {
    // live state of the classic pools, by id
    const id = url.searchParams.get("pool_id");
    if (id !== `in.(${indexedXlmUsdcPool.pool_id})` && id !== `eq.${indexedXlmUsdcPool.pool_id}`) {
      throw new Error(`Unexpected live-pool query: ${id ?? "missing"}`);
    }
    return { status: 200, body: [indexedClassicPool] } satisfies FixtureResponse;
  }

  if (url.pathname === "/liquidity_pools") {
    if (url.searchParams.get("select") !== "pool_id,asset_a,asset_b,reserve_a,reserve_b") {
      throw new Error("Price-pool request has an unexpected projection");
    }
    // the price book asks for XLM pools, then Circle USDC pools
    if (url.searchParams.get("asset_a") === "eq.native") {
      return { status: 200, body: [indexedXlmUsdcPool] } satisfies FixtureResponse;
    }
    if (url.searchParams.get("or")?.includes("USDC:")) {
      return { status: 200, body: [] } satisfies FixtureResponse;
    }
    throw new Error(`Unexpected price-pool query: ${url.search}`);
  }

  if (url.pathname === "/contracts" && url.searchParams.get("contract_id")?.startsWith("in.(")) {
    // nothing known about the most called contracts: they show by address
    return { status: 200, body: [] };
  }
  if (url.pathname === "/ledgers") {
    if (
      url.searchParams.get("select") !==
        "sequence,closed_at,tx_count,failed_tx_count,successful_op_count,base_fee,protocol_version,fee_pool" ||
      url.searchParams.get("order") !== "sequence.desc"
    ) {
      throw new Error("Live-ledger request has an unexpected projection or order");
    }
    // The mainnet live pulse polls this through /api/ledgers/live. No rows keeps
    // it idle; no scenario asserts the pulse.
    return { status: 200, body: [] } satisfies FixtureResponse;
  }

  throw new Error(`Unhandled indexer API request: ${method} ${url.href}`);
}

export function indexerResponseFor(
  url: URL,
  method: string,
  body: unknown,
  headers: RequestHeaders,
): FixtureResponse | null {
  if (url.origin === INDEXER_CLICKHOUSE)
    return clickhouseResponse(url, method, body, headers);
  if (url.origin === INDEXER_API) return apiResponse(url, method, headers);
  return null;
}
