import { test, expect, search } from "./support/test";
import {
  ACCOUNT,
  CONTRACT,
  ISSUER,
  RECIPIENT,
  LEDGER,
  TX,
} from "./fixtures/stellar";

test("transaction search trims whitespace and normalizes uppercase hashes", async ({
  page,
}) => {
  await search(page, `  ${TX.payment.toUpperCase()}  `);
  await expect(page).toHaveURL(`/tx/${TX.payment}`);
  await expect(
    page.getByRole("heading", { name: "Transaction details" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("tabpanel", { name: "Overview" })
      .getByText("Success", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("12.5000001");
  await expect(page.getByRole("main")).toContainText("Browser fixture");
  await page
    .getByRole("main")
    .getByRole("link", { name: "60,000", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ledger 60,000", exact: true }),
  ).toBeVisible();
});

test("account search opens balances and interactive account details", async ({
  page,
}) => {
  await search(page, ACCOUNT);
  await expect(page).toHaveURL(`/account/${ACCOUNT}`);
  await expect(
    page.getByRole("heading", { name: "Account", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("1,234.5000001");
  await page.getByRole("button", { name: "Signers & thresholds" }).click();
  await expect(page.getByRole("main")).toContainText("thresholds 1/2/3");
  await page.getByRole("button", { name: /Data entries/ }).click();
  await expect(page.getByRole("main")).toContainText("Browser test account");
  await page
    .getByRole("navigation", { name: "History filter" })
    .getByRole("link", { name: "Payments", exact: true })
    .click();
  await expect(page).toHaveURL(`/account/${ACCOUNT}?filter=payments`);
  await expect(
    page.getByRole("link", { name: "View transaction", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("link", { name: "View transaction", exact: true })
    .click();
  await expect(page).toHaveURL(`/tx/${TX.payment}`);
  await expect(
    page.getByRole("heading", { name: "Transaction details" }),
  ).toBeVisible();
});

test("contract search renders decoded events, WASM interface and storage", async ({
  page,
}) => {
  await search(page, CONTRACT);
  await expect(page).toHaveURL(`/contract/${CONTRACT}`);
  await expect(
    page.getByRole("heading", { name: "Contract", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy WASM hash", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("ledger 70000");
  await expect(page.getByRole("tabpanel")).toContainText("counter_updated");
  await expect(page.getByRole("tabpanel")).toContainText("9007199254740994");
  await page.getByRole("tab", { name: "Interface", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "increment(value: I128) → I128",
  );
  await page.getByRole("tab", { name: "Storage", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("counter:");
  await expect(page.getByRole("tabpanel")).toContainText("9007199254740993");
  await page.getByRole("tab", { name: "Recent events", exact: true }).click();
  await page
    .getByRole("link", { name: "View transaction", exact: true })
    .click();
  await expect(page).toHaveURL(`/tx/${TX.soroban}`);
  await expect(
    page.getByRole("tabpanel", { name: "Overview" }).locator("#op-1"),
  ).toContainText("increment");
});

test("ledger search supports adjacent ledgers and transaction navigation", async ({
  page,
}) => {
  await search(page, String(LEDGER));
  await expect(page).toHaveURL(`/ledger/${LEDGER}`);
  await expect(
    page.getByRole("heading", { name: "Ledger 60,000", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "3 transactions", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Previous ledger, 59999", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ledger 59,999", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No transactions in this ledger. It closed empty."),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Next ledger, 60000", exact: true })
    .click();
  await page.getByRole("main").locator(`a[href="/tx/${TX.failed}"]`).click();
  await expect(page).toHaveURL(`/tx/${TX.failed}`);
  await expect(
    page
      .getByRole("tabpanel", { name: "Overview" })
      .getByText(/Failed: payment underfunded/),
  ).toBeVisible();
});

test("asset code search normalizes case and opens the chosen asset", async ({
  page,
}) => {
  await search(page, "usdc");
  await expect(page).toHaveURL("/search?q=USDC");
  await expect(
    page.getByRole("heading", { name: "Assets matching USDC" }),
  ).toBeVisible();
  await expect(page.getByText("42 holders", { exact: true })).toBeVisible();
  await page
    .getByRole("main")
    .locator(`a[href="/asset/USDC-${ISSUER}"]`)
    .click();
  await expect(page).toHaveURL(`/asset/USDC-${ISSUER}`);
  await expect(
    page.getByRole("heading", { name: "USDC", exact: true }),
  ).toBeVisible();
});

test("CODE-ISSUER search reaches results for only that issuer", async ({
  page,
}) => {
  await search(page, `USDC-${ISSUER}`);
  await expect(page).toHaveURL(`/search?q=USDC-${ISSUER}`);
  await expect(
    page.getByRole("heading", { name: "Assets matching USDC" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").locator(`a[href="/account/${ISSUER}"]`),
  ).toBeVisible();
  await expect(
    page.getByRole("main").locator(`a[href="/account/${RECIPIENT}"]`),
  ).toHaveCount(0);
});

test("blank search stays put; invalid input is escaped and can be corrected", async ({
  page,
}) => {
  await page.goto("/search");
  const input = page.getByRole("main").getByRole("searchbox");
  await input.fill("   ");
  await input.press("Enter");
  await expect(page).toHaveURL("/search");
  const invalid = "<script>alert(1)</script> & ?";
  await input.fill(invalid);
  await input.press("Enter");
  await expect(page).toHaveURL(`/search?q=${encodeURIComponent(invalid)}`);
  await expect(page.getByRole("main")).toContainText(
    `Nothing matches "${invalid}"`,
  );
  await input.fill(String(LEDGER));
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Ledger 60,000", exact: true }),
  ).toBeVisible();
});
