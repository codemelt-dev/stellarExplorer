import "server-only";
import { activeNetworkId } from "../network";

// two stores behind one login: ClickHouse holds history, the API (PostgREST)
// holds current state
const CLICKHOUSE_URL = process.env.INDEXER_CLICKHOUSE_URL;
const API_URL = process.env.INDEXER_API_URL;
const USER = process.env.INDEXER_USER;
const PASSWORD = process.env.INDEXER_PASSWORD;

const configured = Boolean(CLICKHOUSE_URL && API_URL && USER && PASSWORD);

function authorization(): string {
  return "Basic " + Buffer.from(`${USER}:${PASSWORD}`).toString("base64");
}

/** The indexer only has pubnet. Testnet and unconfigured deploys stay on Horizon. */
export async function indexerActive(): Promise<boolean> {
  return configured && (await activeNetworkId()) === "mainnet";
}

/**
 * Read-only ClickHouse query, rows as objects. Values go in `params` and bind
 * to {name:Type} placeholders. Never build sql from user input.
 */
export async function chQuery<T>(
  sql: string,
  params: Record<string, string | number> = {},
): Promise<T[]> {
  const url = new URL(CLICKHOUSE_URL!);
  url.searchParams.set("database", "stellar");
  url.searchParams.set("default_format", "JSONEachRow");
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(`param_${name}`, String(value));
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authorization() },
    body: sql,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`ClickHouse ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

/**
 * Rows of one API view. `query` is PostgREST syntax: filters like
 * { contract_id: "eq.C..." } plus select / order / limit.
 */
export async function apiGet<T>(view: string, query: Record<string, string>): Promise<T[]> {
  const url = new URL(`${API_URL}/${view}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const res = await fetch(url, {
    headers: { Authorization: authorization(), "Accept-Profile": "api" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Indexer API ${view} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T[];
}

/**
 * Indexer first, the old source (Horizon or RPC) when it is off, fails, or
 * returns null. Null means "not indexed" (nothing before go-live is), so old
 * data still resolves.
 * `anyNetwork` is for mainnet facts shown on every network (home stats). It
 * skips the network cookie, so those pages can stay static.
 */
export async function withIndexer<T>(
  label: string,
  fromIndexer: () => Promise<T | null>,
  fallback: () => Promise<T>,
  { anyNetwork = false }: { anyNetwork?: boolean } = {},
): Promise<T> {
  if (!(anyNetwork ? configured : await indexerActive())) return fallback();
  // dev only: say which source answered, while pages move over one by one
  const trace = process.env.NODE_ENV !== "production";
  const started = Date.now();
  try {
    const result = await fromIndexer();
    if (result !== null) {
      if (trace) console.info(`[indexer] ${label}: served in ${Date.now() - started}ms`);
      return result;
    }
    if (trace) console.info(`[indexer] ${label}: not indexed, falling back`);
  } catch (error) {
    console.warn(
      `[indexer] ${label} failed, falling back:`,
      error instanceof Error ? error.message : error,
    );
  }
  return fallback();
}
