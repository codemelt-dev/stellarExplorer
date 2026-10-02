import { test, expect, search } from "./support/test";
import {
  ACCOUNT, EMPTY_ACCOUNT, MISSING_ACCOUNT, UNAVAILABLE_ACCOUNT, MUXED_ZERO, MUXED_MAX, INVALID_MUXED,
  EMPTY_CONTRACT, MISSING_CONTRACT, UNAVAILABLE_EVENTS_CONTRACT, MISSING_TX, UNAVAILABLE_TX, TX,
} from "./fixtures/stellar";

for (const { address, id } of [{ address: MUXED_ZERO, id: "0" }, { address: MUXED_MAX, id: "18446744073709551615" }]) {
  test(`muxed account ID ${id} resolves to the base account without precision loss`, async ({ page }) => {
    await search(page, address);
    await expect(page).toHaveURL(`/account/${address}`);
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    await expect(page.getByTitle(ACCOUNT, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`id ${id}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("1,234.5000001");
    await page.getByRole("navigation", { name: "History filter" }).getByRole("link", { name: "Payments", exact: true }).click();
    await expect(page).toHaveURL(`/account/${address}?filter=payments`);
    await expect(page.getByRole("link", { name: "View transaction", exact: true })).toHaveCount(1);
  });
}

test("invalid muxed checksum shows a missing-account state, not another account", async ({ page }) => {
  await search(page, INVALID_MUXED);
  await expect(page).toHaveURL(`/account/${INVALID_MUXED}`);
  await expect(page.getByRole("main")).toContainText("doesn't exist on testnet");
  await expect(page.getByRole("main").getByText("Muxed account", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Balances", exact: true })).toHaveCount(0);
});

for (const { name, path, text } of [
  { name: "transaction", path: `/tx/${MISSING_TX}`, text: "No transaction with hash" },
  { name: "account", path: `/account/${MISSING_ACCOUNT}`, text: "doesn't exist on testnet" },
  { name: "contract", path: `/contract/${MISSING_CONTRACT}`, text: "may have been archived" },
  { name: "ledger", path: "/ledger/999999", text: "doesn't exist on testnet yet" },
]) {
  test(`missing ${name} leaves search available for recovery`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("main")).toContainText(text);
    const input = page.getByRole("searchbox", { name: "Search the Stellar network" }).filter({ visible: true });
    await input.fill(ACCOUNT);
    await input.press("Enter");
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  });
}

for (const { name, path } of [
  { name: "transaction", path: `/tx/${UNAVAILABLE_TX}` },
  { name: "account", path: `/account/${UNAVAILABLE_ACCOUNT}` },
  { name: "ledger", path: "/ledger/999998" },
]) {
  test(`${name} upstream failure renders an alert rather than a missing record`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(`Horizon didn't respond while loading this ${name}.`);
    await expect(page.getByRole("main")).not.toContainText("doesn't exist");
  });
}

test("empty account history and filtered history have helpful states", async ({ page }) => {
  await page.goto(`/account/${EMPTY_ACCOUNT}`);
  await expect(page.getByRole("paragraph").filter({ hasText: /^No operations yet\. This account hasn't transacted\.$/ })).toBeVisible();
  await page.getByRole("navigation", { name: "History filter" }).getByRole("link", { name: "Contract calls", exact: true }).click();
  await expect(page.getByRole("paragraph").filter({ hasText: /^No contract calls in this account's history\.$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Older →", exact: true })).toHaveCount(0);
});

test("empty asset search explains the lack of matches", async ({ page }) => {
  await search(page, "ZZZ");
  await expect(page).toHaveURL("/search?q=ZZZ");
  await expect(page.getByRole("main")).toContainText('Nothing matches "ZZZ"');
});

test("built-in asset contract explains empty events, standard interface and empty storage", async ({ page }) => {
  await page.goto(`/contract/${EMPTY_CONTRACT}`);
  await expect(page.getByRole("heading", { name: "Stellar Asset Contract", exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("No events in the recent ledger window");
  await page.getByRole("tab", { name: "Interface", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("standard token interface");
  await page.getByRole("tab", { name: "Storage", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No instance storage");
});

test("contract events outage preserves the contract and its other tabs", async ({ page }) => {
  await page.goto(`/contract/${UNAVAILABLE_EVENTS_CONTRACT}`);
  await expect(page.getByRole("heading", { name: "Contract", exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("Couldn't reach Stellar RPC for events");
  await page.getByRole("tab", { name: "Storage", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("9007199254740993");
});

test("transaction with no operations can still show fees and raw data", async ({ page }) => {
  await page.goto(`/tx/${TX.empty}`);
  await expect(page.getByRole("heading", { name: "0 operations", exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Overview" }).getByText("Horizon returned no operations for this transaction.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Effects", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No balance movements");
  await expect(page.getByRole("tabpanel")).toContainText("network fee");
});

test("slow transaction navigation shows a loading state which resolves", async ({ page }) => {
  await search(page, TX.slow);
  await expect(page.getByRole("main").locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Transaction details" })).toBeVisible();
  await expect(page.getByRole("main").locator('[aria-busy="true"]')).toHaveCount(0);
});

for (const sequence of ["0", "-1", "abc", "9007199254740992"]) {
  test(`invalid ledger ${sequence} is rejected without an upstream lookup`, async ({ page }) => {
    await page.goto(`/ledger/${sequence}`);
    await expect(page.getByRole("main")).toContainText(`"${sequence}" isn't a valid ledger sequence.`);
  });
}
