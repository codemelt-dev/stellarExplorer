import { test, expect } from "./support/test";
import {
  INDEXED_LEDGER,
  INDEXED_LEDGER_HASH,
  INDEXED_TX_HASH,
  INDEXER_UNAVAILABLE_LEDGER,
  MISSING_INDEXED_ASSET_CODE,
} from "./fixtures/indexer";
import { ISSUER, ledgerRecord, transactions, TX } from "./fixtures/stellar";

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  await context.addCookies([
    {
      name: "network",
      value: "mainnet",
      url: baseURL,
    },
  ]);
});

test("a ClickHouse outage falls back to Horizon for a known mainnet ledger", async ({
  page,
}) => {
  await page.goto(`/ledger/${INDEXER_UNAVAILABLE_LEDGER}`);
  const main = page.getByRole("main");

  await expect(
    page.getByRole("heading", {
      name: `Ledger ${INDEXER_UNAVAILABLE_LEDGER.toLocaleString("en-US")}`,
    }),
  ).toBeVisible();
  await expect(main.locator(`[title="${ledgerRecord().hash}"]`)).toBeVisible();
  await expect(main.locator(`[title="${INDEXED_LEDGER_HASH}"]`)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "3 transactions" }),
  ).toBeVisible();
  await expect(
    main.locator(`[title="${transactions[TX.payment].hash}"]`),
  ).toBeVisible();
});

test("mainnet ledger history and detail come from authenticated ClickHouse requests", async ({
  page,
}) => {
  await page.goto("/ledgers");
  const main = page.getByRole("main");

  await expect(main.getByRole("heading", { name: "Ledgers" })).toBeVisible();
  await expect(main.getByText("Latest on mainnet")).toBeVisible();
  const row = main.getByRole("link", {
    name: `Open ledger ${INDEXED_LEDGER}`,
    exact: true,
  });
  await expect(row).toContainText(INDEXED_LEDGER.toLocaleString("en-US"));
  await expect(row).toContainText("66.7%");
  await expect(row.locator(`[title="${INDEXED_LEDGER_HASH}"]`)).toBeVisible();

  await row
    .getByRole("link", { name: INDEXED_LEDGER.toLocaleString("en-US") })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Ledger ${INDEXED_LEDGER.toLocaleString("en-US")}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "1 transaction" }),
  ).toBeVisible();
  await expect(main.locator(`[title="${INDEXED_TX_HASH}"]`)).toBeVisible();
});

test("mainnet XLM summary and holder ranking use indexer data", async ({
  page,
}) => {
  await page.goto("/asset/XLM");
  const main = page.getByRole("main");

  await expect(main.getByRole("heading", { name: "XLM" })).toBeVisible();
  await expect(main.getByText("7,654,321", { exact: true })).toBeVisible();
  await expect(main.getByText("50.0M", { exact: true })).toBeVisible();
  await expect(main.getByText("40.0%", { exact: true })).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "Top holders" }),
  ).toBeVisible();
  await expect(main.getByText("12,500,000 XLM", { exact: true })).toBeVisible();

  await expect(main.getByRole("heading", { name: "Holder map" })).toBeVisible();
  await expect(
    main.getByRole("img", { name: "Top 2 holders of XLM as bubbles sized by their share of the supply" }),
  ).toBeVisible();
  await expect(
    main.getByText(/Lines join holders that moved XLM between each other in the last 90 days/),
  ).toBeVisible();
  await expect(main.getByText(/1 cluster holds 40\.00% of the supply/)).toBeVisible();
});

test("an unindexed mainnet asset falls back to Horizon's missing-record result", async ({
  page,
}) => {
  await page.goto(`/asset/${MISSING_INDEXED_ASSET_CODE}-${ISSUER}`);

  await expect(
    page
      .getByRole("main")
      .getByText(
        `No asset ${MISSING_INDEXED_ASSET_CODE} from this issuer on mainnet.`,
      ),
  ).toBeVisible();
});

test("a first visit with no network cookie opens on mainnet", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/asset/XLM");

  await expect(
    page.getByRole("main").getByText("7,654,321", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Network: Stellar Mainnet/ }),
  ).toBeVisible();
});

test("the indexer stays gated off until the browser switches to mainnet", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  await page
    .context()
    .addCookies([{ name: "network", value: "testnet", url: baseURL }]);
  await page.goto("/asset/XLM");
  const main = page.getByRole("main");

  await expect(
    main.getByText("Switch to Mainnet in the top bar to see them."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Network: Stellar Testnet/ }).click();
  await page.getByRole("menuitem", { name: "Stellar Mainnet" }).click();

  await expect(main.getByRole("heading", { name: "XLM" })).toBeVisible();
  await expect(main.getByText("7,654,321", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Network: Stellar Mainnet/ }),
  ).toBeVisible();
});
