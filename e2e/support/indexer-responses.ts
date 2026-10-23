import {
  INDEXED_LEDGER,
  INDEXER_MISSING_LEDGER,
  INDEXER_UNAVAILABLE_LEDGER,
  INDEXER_API,
  INDEXER_AUTHORIZATION,
  INDEXER_CLICKHOUSE,
  MAINNET_XLM_INSTANCE_KEY_HASH,
  MISSING_INDEXED_ASSET,
  indexedLedger,
  indexedLedgerTransaction,
  indexedXlm,
  indexedXlmHolders,
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
