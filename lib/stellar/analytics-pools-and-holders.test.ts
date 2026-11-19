import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.hoisted(() => {
  for (const [key, value] of Object.entries({
    E2E_ANALYTICS_POOLS_AND_HOLDERS: "1",
    INDEXER_CLICKHOUSE_URL: "https://clickhouse.indexer.e2e.invalid/query",
    INDEXER_API_URL: "https://api.indexer.e2e.invalid",
    INDEXER_USER: "e2e-indexer-user",
    INDEXER_PASSWORD: "e2e-indexer-password",
    NEXT_PUBLIC_MAINNET_RPC_URL: "https://rpc.e2e.invalid",
  }))
    vi.stubEnv(key, value);
});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./network", async () => {
  const { getNetwork } = await import("./config");
  return {
    activeNetworkId: async () => "mainnet",
    activeNetwork: async () => getNetwork("mainnet"),
  };
});

import { responseFor } from "../../e2e/support/responses";
import {
  getPool,
  poolIdOf,
  getProtocolTotals,
  getProtocolTvlHistory,
  getProtocolVolumeHistory,
  type PoolDetail,
} from "./pools";
import {
  CLASSIC_POOL_ADDRESS,
  SOROSWAP_PAIR,
} from "../../e2e/fixtures/indexer";
import {
  AQUARIUS_POOL,
  MISSING_POOL,
  UNAVAILABLE_POOL,
  UNPRICED_POOL,
  QUIET_POOL,
  UNSUPPORTED_POOL,
} from "../../e2e/fixtures/analytics";
import { TX } from "../../e2e/fixtures/stellar";

const unexpected: string[] = [];
const requestedOrigins = new Set<string>();
beforeAll(() => {
  // Exercise real indexer HTTP clients and application transformations, with
  // independent wire fixtures. Does not execute SQL or contact a live backend.
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    try {
      requestedOrigins.add(new URL(String(input)).origin);
      const fixture = responseFor(
        new URL(String(input)),
        init?.method ?? "GET",
        init?.body,
        Object.fromEntries(new Headers(init?.headers)),
      );
      return new Response(
        typeof fixture.body === "string"
          ? fixture.body
          : JSON.stringify(fixture.body),
        {
          status: fixture.status,
          headers: {
            "content-type": fixture.contentType ?? "application/json",
          },
        },
      );
    } catch (error) {
      unexpected.push(String(error));
      throw error;
    }
  });
});
afterEach(() => {
  requestedOrigins.clear();
  expect(
    unexpected.splice(0),
    "All HTTP requests must have explicit fixtures",
  ).toEqual([]);
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function detail(id: string): Promise<PoolDetail> {
  const pool = await getPool(poolIdOf(id)!);
  expect(pool).not.toBeNull();
  expect(pool).not.toBe("missing");
  return pool as PoolDetail;
}

describe("Analytics: pools and holders: indexer HTTP records to pool analytics", () => {
  it.each([
    [CLASSIC_POOL_ADDRESS, 4_000_000, 200, 0.6, 3],
    [SOROSWAP_PAIR, 400_000, 600, 1.8, 2],
    [AQUARIUS_POOL, 120_000, 100, 0.1, 1],
  ])(
    "values %s and counts each swap once",
    async (id, tvl, volume, fees, trades) => {
      const pool = await detail(String(id));
      expect(pool.tvlUsd).toBe(tvl);
      expect(pool.volume24hUsd).toBe(volume);
      expect(pool.fees24hUsd).toBeCloseTo(Number(fees), 8);
      expect(pool.trades24h).toBe(trades);
      expect(pool.daily.map((day) => day.volume)).toEqual([volume, volume]);
      expect(pool.tvlHistory.map((day) => day.tvl)).toEqual([tvl, tvl]);
    },
  );

  it("preserves exact reserves, classic pool shares and fee", async () => {
    const pool = await detail(CLASSIC_POOL_ADDRESS);
    expect(pool.a.exact).toBe("10000000");
    expect(pool.b.exact).toBe("2000000");
    expect(pool.shares).toBe(400_000);
    expect(pool.accounts).toBe(832);
    expect(pool.feeBp).toBe(30);
  });

  it("nets refunds, distinguishes deposits/withdrawals and excludes one-sided rewards", async () => {
    const pool = await detail(SOROSWAP_PAIR);
    expect(pool.activity.map((op) => op.kind)).toEqual([
      "trade",
      "deposit",
      "withdraw",
    ]);
    expect(pool.activity[0].legs.map((leg) => [leg.amount, leg.into])).toEqual([
      ["100", true],
      ["20", false],
    ]);
    expect(pool.activity[1].legs.map((leg) => leg.amount)).toEqual([
      "500",
      "100",
    ]);
    expect(pool.activity[2].legs.map((leg) => leg.into)).toEqual([
      false,
      false,
    ]);
    expect(pool.activity.map((op) => op.txHash)).toEqual([
      TX.payment,
      TX.soroban,
      TX.feeBump,
    ]);
  });

  it("reconciles exact per-protocol totals independently of the third-party provider", async () => {
    const totals = await getProtocolTotals();
    expect(totals).toEqual([
      {
        protocol: "classic",
        pools: 1,
        tvlUsd: 4_000_000,
        volume24hUsd: 200,
        fees24hUsd: 0.6,
        trades24h: 3,
      },
      {
        protocol: "aquarius",
        pools: 1,
        tvlUsd: 120_000,
        volume24hUsd: 100,
        fees24hUsd: 0.1,
        trades24h: 1,
      },
      {
        protocol: "soroswap",
        pools: 1,
        tvlUsd: 400_000,
        volume24hUsd: 600,
        fees24hUsd: 1.8,
        trades24h: 2,
      },
    ]);
    expect([...requestedOrigins].sort()).toEqual([
      "https://api.indexer.e2e.invalid",
      "https://clickhouse.indexer.e2e.invalid",
    ]);
    expect(totals!.reduce((sum, p) => sum + p.tvlUsd, 0)).toBe(4_520_000);
    expect(totals!.reduce((sum, p) => sum + p.volume24hUsd, 0)).toBe(900);
  });

  it("reconciles chart values with the protocol totals", async () => {
    const tvl = await getProtocolTvlHistory();
    expect(tvl?.map((day) => day.tvl)).toEqual(
      Array(2).fill({
        classic: 4_000_000,
        aquarius: 120_000,
        soroswap: 400_000,
      }),
    );
    const volume = await getProtocolVolumeHistory();
    expect(volume?.map((day) => day.volume)).toEqual([
      { classic: 200, aquarius: 100, soroswap: 600 },
    ]);
  });

  it("distinguishes missing pools, backend outages and unknown valuation", async () => {
    expect(await getPool(MISSING_POOL)).toBe("missing");
    expect(await getPool(UNSUPPORTED_POOL)).toBe("missing");
    expect(await getPool(UNAVAILABLE_POOL)).toBeNull();
    const unpriced = await detail(UNPRICED_POOL);
    expect(unpriced.tvlUsd).toBeNull();
    expect(unpriced.valuedBy).toBeNull();
    const quiet = await detail(QUIET_POOL);
    expect(quiet.trades24h).toBe(0);
    expect(quiet.activity).toEqual([]);
  });
});

describe("Analytics: pools and holders: asset and contract holder pipeline", () => {
  it.each(["USDQ", "BOND"])(
    "reads %s supply, top 100 holders and transfer links",
    async (code) => {
      const { getAsset, getTopHolders, getHolderLinks } =
        await import("./assets");
      const { ISSUER, ACCOUNT } = await import("../../e2e/fixtures/stellar");
      const identity = { kind: "issued" as const, code, issuer: ISSUER };
      expect(await getAsset(identity)).toMatchObject({
        holders: 1200,
        supply: "100000000000000",
      });
      const holders = await getTopHolders(identity);
      expect(holders).toHaveLength(100);
      expect(holders![0]).toEqual({
        rank: 1,
        holder: ACCOUNT,
        balance: "250000000000",
      });
      expect(holders![99].rank).toBe(100);
      const links = await getHolderLinks(
        identity,
        holders!.map((h) => h.holder),
      );
      expect(links).toHaveLength(1);
      expect(links![0].transfers).toBe(5);
      expect((BigInt(holders![0].balance) * 10_000n) / 100000000000000n).toBe(
        25n,
      );
    },
  );

  it("decodes the SAC identity and loads its interface without unexpected RPC requests", async () => {
    const { STABLE_SAC } = await import("../../e2e/fixtures/analytics");
    const { ISSUER } = await import("../../e2e/fixtures/stellar");
    const { getContractSummary, getContractInterface } =
      await import("./contracts");
    const { contractAsset } = await import("./contractDecode");
    const summary = await getContractSummary(STABLE_SAC);
    expect(
      contractAsset(summary!, "Public Global Stellar Network ; September 2015"),
    ).toMatchObject({ code: "USDQ", issuer: ISSUER });
    expect(await getContractInterface(STABLE_SAC)).toBeNull();
  });

  it("uses token metadata precision and distinguishes incomplete history and custom metadata", async () => {
    const { STANDARD_TOKEN, INCOMPLETE_TOKEN, CUSTOM_TOKEN } =
      await import("../../e2e/fixtures/analytics");
    const {
      getContractSummary,
      getContractStorage,
      getContractEvents,
      getContractCreation,
      getContractInterface,
    } = await import("./contracts");
    const { getToken, getTopHolders } = await import("./assets");
    const { tokenMetadata } = await import("./contractDecode");
    const { unitsToDecimal } = await import("./amount");
    const summary = await getContractSummary(STANDARD_TOKEN);
    expect(tokenMetadata(summary!)).toMatchObject({
      symbol: "NINE",
      decimals: 9,
    });
    expect(await getToken(STANDARD_TOKEN)).toMatchObject({
      complete: true,
      holders: 1200,
    });
    const holders = await getTopHolders({
      kind: "contract",
      contractId: STANDARD_TOKEN,
    });
    expect(holders).toHaveLength(100);
    expect(unitsToDecimal(holders![0].balance, 9)).toBe("25000");
    expect(await getToken(INCOMPLETE_TOKEN)).toMatchObject({ complete: false });
    expect(
      tokenMetadata((await getContractSummary(CUSTOM_TOKEN))!),
    ).toBeUndefined();
    expect(await getContractStorage(STANDARD_TOKEN)).toEqual({
      entries: [],
      next: null,
    });
    expect(await getContractEvents(STANDARD_TOKEN)).toEqual({
      events: [],
      next: null,
    });
    expect(await getContractCreation(STANDARD_TOKEN)).toBeNull();
    expect(await getContractInterface(STANDARD_TOKEN)).not.toBeNull();
  });

  it("renders the holder account's data pipeline without unsupported requests", async () => {
    const { ACCOUNT } = await import("../../e2e/fixtures/stellar");
    const { getAccount, getAccountOperations } = await import("./accounts");
    expect(await getAccount(ACCOUNT)).toMatchObject({ id: ACCOUNT });
    expect(await getAccountOperations(ACCOUNT, {})).toMatchObject({
      records: [],
    });
  });
});

it("lays out all 100 holders with distinct addresses and usable non-overlapping nodes", async () => {
  const { allHolders } = await import("../../e2e/fixtures/analytics");
  const { layoutHolders } = await import("./holderMap");
  const holders = allHolders.slice(0, 100).map((h) => ({ ...h, share: null }));
  const layout = layoutHolders(holders, []);
  expect(layout.nodes).toHaveLength(100);
  expect(new Set(layout.nodes.map((node) => node.holder)).size).toBe(100);
  for (const [i, node] of layout.nodes.entries()) {
    expect(
      Number.isFinite(node.x) && Number.isFinite(node.y) && node.r > 0,
    ).toBe(true);
    for (const other of layout.nodes.slice(i + 1)) {
      expect(Math.hypot(node.x - other.x, node.y - other.y)).toBeGreaterThan(
        node.r + other.r,
      );
    }
  }
});
