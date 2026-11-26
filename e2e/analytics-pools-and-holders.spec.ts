import { test, expect } from "./support/test";
import { type Locator, type Page } from "@playwright/test";
import { ACCOUNT, ISSUER, TX } from "./fixtures/stellar";
import { CLASSIC_POOL_ADDRESS, SOROSWAP_PAIR } from "./fixtures/indexer";
import {
  allHolders,
  STABLE_SAC,
  STANDARD_TOKEN,
  INCOMPLETE_TOKEN,
  CUSTOM_TOKEN,
  AQUARIUS_POOL,
  MISSING_POOL,
  UNAVAILABLE_POOL,
  UNPRICED_POOL,
  QUIET_POOL,
  UNSUPPORTED_POOL,
} from "./fixtures/analytics";

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("A local test server is required");
  await context.addCookies([
    { name: "network", value: "mainnet", url: baseURL },
  ]);
});

function tile(page: Page, label: string): Locator {
  return page
    .getByRole("main")
    .locator(".tile")
    .filter({ has: page.getByText(label, { exact: true }) });
}

for (const pool of [
  {
    name: "classic",
    id: CLASSIC_POOL_ADDRESS,
    tvl: "$4.0M",
    volume: "$200",
    reserves: ["10,000,000 XLM", "2,000,000 USDC"],
    badge: "constant product, 0.30% fee",
  },
  {
    name: "Soroswap",
    id: SOROSWAP_PAIR,
    tvl: "$400.0K",
    volume: "$600",
    reserves: ["1,000,000 XLM", "200,000 USDC"],
    badge: "Soroswap, constant product, 0.30% fee",
  },
  {
    name: "Aquarius",
    id: AQUARIUS_POOL,
    tvl: "$120.0K",
    volume: "$100",
    reserves: ["100,000 XLM", "100,000 USDC"],
    badge: "Aquarius, concentrated liquidity, 0.10% fee",
  },
]) {
  test(`${pool.name} pool: reserves, TVL, fee, volume, charts and activity`, async ({
    page,
  }) => {
    await page.goto(`/pool/${pool.id}`);
    const main = page.getByRole("main");
    await expect(main.getByText(pool.badge, { exact: true })).toBeVisible();
    await expect(tile(page, "TVL")).toContainText(pool.tvl);
    await expect(tile(page, "Volume 24h")).toContainText(pool.volume);
    for (const reserve of pool.reserves)
      await expect(main.getByText(reserve, { exact: true })).toBeVisible();
    if (pool.name === "classic") {
      await expect(tile(page, "LP accounts")).toContainText("832");
      await expect(tile(page, "LP accounts")).toContainText(
        "400.0K pool shares",
      );
    }
    const history = main.getByRole("region", { name: "History" });
    await expect(
      history.getByRole("img", { name: "Daily volume over the last 2 days" }),
    ).toBeVisible();
    await history.getByRole("button", { name: "TVL", exact: true }).click();
    await expect(
      history.getByRole("img", {
        name: `XLM / USDC pool value locked over the last 2 days, currently ${pool.tvl}`,
      }),
    ).toBeVisible();
    await history.getByRole("button", { name: "7D", exact: true }).click();
    await expect(history.getByRole("img")).toBeVisible();

    const activity = main.locator("#activity");
    await expect(activity.getByText("Swapped", { exact: true })).toHaveCount(1);
    await expect(activity.getByText("Deposited", { exact: true })).toHaveCount(
      1,
    );
    await expect(activity.getByText("Withdrew", { exact: true })).toHaveCount(
      1,
    );
    await expect(activity.getByText("100 XLM", { exact: true })).toBeVisible();
    await expect(activity.getByText("20 USDC", { exact: true })).toBeVisible();
    await expect(activity.getByText("500 XLM", { exact: true })).toBeVisible();
    await expect(activity.getByText("250 XLM", { exact: true })).toBeVisible();
    const transactions = activity.getByRole("link", {
      name: "View transaction",
    });
    await expect(transactions).toHaveCount(3);
    await expect(transactions.nth(0)).toHaveAttribute(
      "href",
      `/tx/${TX.payment}`,
    );
    await expect(transactions.nth(1)).toHaveAttribute(
      "href",
      `/tx/${TX.soroban}`,
    );
    await expect(transactions.nth(2)).toHaveAttribute(
      "href",
      `/tx/${TX.feeBump}`,
    );
  });
}

test("DeFi overview reconciles all indexed protocols and the third-party comparison", async ({
  page,
}) => {
  await page.goto("/defi");
  await expect(tile(page, "Value locked")).toContainText("$4.5M");
  await expect(tile(page, "Value locked")).toContainText("3 pools");
  await expect(tile(page, "Volume 24h")).toContainText("$900");
  await expect(tile(page, "Volume 24h")).toContainText("6 trades");
  // $520k across the two overlapping protocols vs $600k = -13.3%.
  await expect(tile(page, "Ours vs DefiLlama")).toContainText("13.3%");
  await expect(tile(page, "Ours vs DefiLlama")).toContainText(
    "$520.0K vs $600.0K",
  );
  const soroswap = page.getByRole("link", {
    name: "Open Soroswap",
    exact: true,
  });
  await expect(soroswap).toContainText("$400.0K");
  await expect(soroswap).toContainText("$500.0K");
  await expect(soroswap).toContainText("-20.0%");
  await expect(soroswap).toContainText("$600");
  await expect(soroswap).toContainText("$750");
  const aquarius = page.getByRole("link", {
    name: "Open Aquarius",
    exact: true,
  });
  await expect(aquarius).toContainText("$120.0K");
  await expect(aquarius).toContainText("$100.0K");
  await expect(aquarius).toContainText("+20.0%");
  await expect(aquarius).toContainText("$125");
  // Blend's $9m is comparison-only, excluded from our $4.52m total.
  const blend = page.getByRole("link", { name: "Open Blend", exact: true });
  await expect(blend).toContainText("not indexed yet");
  await expect(blend).toContainText("$9.0M");
  await expect(
    page.getByRole("link", { name: "Open Stellar AMM", exact: true }),
  ).toContainText("not listed");
  await expect(
    page.getByRole("img", { name: /Value locked in the pools we index/ }),
  ).toBeVisible();
});

for (const code of ["USDQ", "BOND"]) {
  test(`${code}: asset with 1,200 holders renders the actual top 100`, async ({
    page,
  }) => {
    await page.goto(`/asset/${code}-${ISSUER}`);
    await expect(tile(page, "Holders")).toContainText("1,200");
    const map = page.locator("#holder-map");
    const bubbles = map.locator("svg [data-holder]");
    await expect(bubbles).toHaveCount(100);
    expect(
      await bubbles.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-holder")),
      ),
    ).toEqual(allHolders.slice(0, 100).map((h) => h.holder));
    await expect(
      map.locator(`[data-holder="${allHolders[100].holder}"]`),
    ).toHaveCount(0);
    await expect(
      map.getByRole("img", {
        name: `Top 100 holders of ${code} as bubbles sized by their share of the supply`,
      }),
    ).toBeVisible();
  });
}

test("USDQ history charts holders, supply and volume per day; the range switches", async ({
  page,
}) => {
  await page.goto(`/asset/USDQ-${ISSUER}`);
  const history = page
    .getByRole("main")
    .getByRole("region", { name: "History" });
  // the latest day matches the tiles
  await expect(tile(page, "Holders")).toContainText("1,200");
  await expect(tile(page, "Supply")).toContainText("10.0M");
  await expect(
    history.getByRole("img", {
      name: "Holders per day over 30 days, latest 1,200",
    }),
  ).toBeVisible();
  await expect(
    history.getByRole("img", {
      name: "Supply in USDQ per day over 30 days, latest 10.0M USDQ",
    }),
  ).toBeVisible();
  await expect(
    history.getByRole("img", {
      name: "Volume against XLM per day over the last 30 days, latest 25.0K XLM",
    }),
  ).toBeVisible();
  await expect(
    history.getByText("750.0K XLM total", { exact: true }),
  ).toBeVisible();

  await history.getByRole("button", { name: "All", exact: true }).click();
  await expect(
    history.getByRole("img", {
      name: "Holders per day over 100 days, latest 1,200",
    }),
  ).toBeVisible();
  await expect(
    history.getByRole("img", {
      name: "Supply in USDQ per day over 100 days, latest 10.0M USDQ",
    }),
  ).toBeVisible();
});

test("holder hover or first tap shows balance/share; click or second tap opens the account", async ({
  page,
  isMobile,
}) => {
  await page.goto(`/asset/USDQ-${ISSUER}`);
  const map = page.locator("#holder-map");
  const node = map.locator(`[data-holder="${ACCOUNT}"]`);
  if (isMobile) await node.tap();
  else await node.hover();
  await expect(map.getByText("25,000 USDQ", { exact: true })).toBeVisible();
  await expect(
    map.getByText("0.25% of the supply", { exact: true }),
  ).toBeVisible();
  await expect(
    map.getByText(`${ACCOUNT.slice(0, 6)}…${ACCOUNT.slice(-6)}`, {
      exact: true,
    }),
  ).toBeVisible();
  if (isMobile) await node.tap();
  else await node.click();
  await expect(page).toHaveURL(new RegExp(`/account/${ACCOUNT}$`));
  await expect(
    page.getByRole("main").getByText(ACCOUNT, { exact: true }),
  ).toBeVisible();
});

test("Holder map supports hiding and restoring a holder and zoom reset", async ({
  page,
}) => {
  await page.goto(`/asset/USDQ-${ISSUER}`);
  const map = page.locator("#holder-map");
  await map
    .getByRole("button", { name: "Hide holder 1 on the map", exact: true })
    .click();
  await expect(map.locator("svg [data-holder]")).toHaveCount(99);
  await map
    .getByRole("button", { name: "Show holder 1 on the map", exact: true })
    .click();
  await expect(map.locator("svg [data-holder]")).toHaveCount(100);
  const svg = map.getByRole("img");
  const original = await svg.getAttribute("viewBox");
  await map.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(svg).not.toHaveAttribute("viewBox", original!);
  await map
    .getByRole("button", { name: "Show the whole map", exact: true })
    .click();
  await expect(svg).toHaveAttribute("viewBox", original!);
});

test("SAC links to its underlying classic asset's holder map", async ({
  page,
}) => {
  await page.goto(`/contract/${STABLE_SAC}`);
  await page
    .getByRole("link", { name: "Holders and supply", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/asset/USDQ-${ISSUER}$`));
  await expect(page.locator("#holder-map svg [data-holder]")).toHaveCount(100);
});

test("standard Soroban token honors nine decimals and known supply", async ({
  page,
}) => {
  await page.goto(`/contract/${STANDARD_TOKEN}`);
  const map = page.locator("#holder-map");
  await expect(map.locator("svg [data-holder]")).toHaveCount(100);
  await expect(
    page.getByRole("main").getByText("Best effort", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("main")
      .locator("#holders")
      .getByText("25,000 NINE", { exact: true }),
  ).toBeVisible();
  await expect(
    map.getByRole("img", { name: /share of the supply/ }),
  ).toBeVisible();
});

for (const id of [INCOMPLETE_TOKEN, CUSTOM_TOKEN]) {
  test(`token limitation is visible: ${id === INCOMPLETE_TOKEN ? "incomplete history" : "unknown metadata"}`, async ({
    page,
  }) => {
    await page.goto(`/contract/${id}`);
    await expect(
      page.getByRole("main").getByText("Best effort", { exact: true }),
    ).toBeVisible();
    if (id === INCOMPLETE_TOKEN) {
      await expect(
        page
          .getByRole("main")
          .getByText(/missing some of this token's transfers/),
      ).toBeVisible();
      await expect(
        page
          .locator("#holder-map")
          .getByRole("img", { name: /sized by their balance$/ }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("main")
          .locator("#holders")
          .getByText("Share", { exact: true }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole("main").getByText(/balances are in raw units/),
      ).toBeVisible();
    }
  });
}

for (const scenario of [
  {
    name: "missing pool",
    id: MISSING_POOL,
    message: /No liquidity pool with this id/,
  },
  {
    name: "indexer unavailable",
    id: UNAVAILABLE_POOL,
    message: /The indexer didn't respond while loading this pool/,
  },
  {
    name: "unsupported protocol",
    id: UNSUPPORTED_POOL,
    message: /isn't a Soroswap or Aquarius pool/,
  },
  { name: "invalid pool ID", id: "invalid", message: /isn't a pool id/ },
]) {
  test(`pool failure is explicit: ${scenario.name}`, async ({ page }) => {
    await page.goto(`/pool/${scenario.id}`);
    await expect(
      page.getByRole("main").getByText(scenario.message),
    ).toBeVisible();
    await expect(tile(page, "TVL")).toHaveCount(0);
  });
}

test("unpriced pool does not invent a dollar valuation", async ({ page }) => {
  await page.goto(`/pool/${UNPRICED_POOL}`);
  await expect(tile(page, "TVL")).toContainText("–");
  await expect(tile(page, "TVL")).toContainText(
    "neither side has a reliable price",
  );
  await expect(
    page.getByRole("main").getByText("no price", { exact: true }),
  ).toHaveCount(2);
});

test("quiet pool shows zero volume and explicit empty activity", async ({
  page,
}) => {
  await page.goto(`/pool/${QUIET_POOL}`);
  await expect(tile(page, "Volume 24h")).toContainText("$0");
  await expect(tile(page, "Volume 24h")).toContainText("0 trades");
  await expect(
    page
      .getByRole("main")
      .getByText(
        "No trades, deposits or withdrawals indexed for this pool yet.",
      ),
  ).toBeVisible();
});

test("pool data is explicitly unavailable on testnet", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "network", value: "testnet", url: baseURL! },
  ]);
  await page.goto(`/pool/${CLASSIC_POOL_ADDRESS}`);
  await expect(
    page
      .getByRole("main")
      .getByText(/Switch to Mainnet in the top bar to see this pool/),
  ).toBeVisible();
});
