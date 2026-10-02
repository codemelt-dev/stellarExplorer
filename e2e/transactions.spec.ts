import { test, expect } from "./support/test";
import { ACCOUNT, ISSUER, CONTRACT, TX, transactions } from "./fixtures/stellar";

test("Soroban invocation decodes named arguments, return value and events from XDR", async ({ page }) => {
  await page.goto(`/tx/${TX.soroban}`);
  await expect(page.getByRole("heading", { name: "Transaction details" })).toBeVisible();
  const operation = page.getByRole("tabpanel", { name: "Overview" }).locator("#op-1");
  await expect(operation).toContainText("increment");
  await expect(operation.locator(`a[href="/contract/${CONTRACT}"]`)).toBeVisible();
  await expect(operation).toContainText("value:");
  await expect(operation).toContainText("9007199254740993");
  await expect(operation).toContainText("Returned");
  await expect(operation).toContainText("9007199254740994");
  await expect(page.getByRole("main")).toContainText("counter_updated");
  await expect(operation.locator("pre")).toHaveCount(0);
  await page.getByRole("tab", { name: "XDR", exact: true }).click();
  await expect(page.getByRole("tabpanel").locator("pre")).toHaveCount(0);
  await page.getByRole("button", { name: "Raw XDR", exact: true }).click();
  await expect(page.getByRole("tabpanel").locator("pre").first()).toHaveText(transactions[TX.soroban].envelope_xdr);
  await page.getByRole("button", { name: "Raw XDR", exact: true }).click();
  await expect(page.getByRole("tabpanel").locator("pre")).toHaveCount(0);
});

for (const { name, hash, reason } of [
  { name: "underfunded payment", hash: TX.failed, reason: "payment underfunded" },
  { name: "trapped Soroban call", hash: TX.failedSoroban, reason: "invoke host function trapped" },
]) {
  test(`failed ${name} displays a decoded reason and charges only the fee`, async ({ page }) => {
    await page.goto(`/tx/${hash}`);
    await expect(page.getByRole("tabpanel", { name: "Overview" }).getByText(`Failed: ${reason}. The fee was still charged.`, { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Effects", exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText("No balance changes. Failed transactions change nothing except the fee below.");
    await expect(page.getByRole("tabpanel")).toContainText("network fee");
    await expect(page.getByRole("tabpanel")).toContainText("0.00001");
    await expect(page.getByRole("tabpanel").locator(`a[href="/account/${ACCOUNT}"]`)).toBeVisible();
  });
}

test("fee bump decodes the inner payment and identifies the separate fee payer", async ({ page }) => {
  await page.goto(`/tx/${TX.feeBump}`);
  await expect(page.getByRole("heading", { name: "Transaction details" })).toBeVisible();
  const overview = page.getByRole("tabpanel", { name: "Overview" });
  await expect(overview.getByText("Fee paid by", { exact: true })).toBeVisible();
  await expect(overview.locator(`a[href="/account/${ISSUER}"]`)).toBeVisible();
  await expect(overview.getByTitle(TX.payment, { exact: true })).toBeVisible();
  await expect(overview.locator("#op-1")).toContainText("12.5000001");
  await page.getByRole("tab", { name: "Effects", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("received");
  await expect(page.getByRole("tabpanel")).toContainText("0.00004");
  await expect(page.getByRole("tabpanel").locator(`a[href="/account/${ISSUER}"]`)).toBeVisible();
});

test("unknown operation keeps a readable fallback and the original raw record", async ({ page }) => {
  await page.goto(`/tx/${TX.unknown}`);
  await expect(page.getByRole("heading", { name: "Transaction details" })).toBeVisible();
  const operation = page.getByRole("tabpanel", { name: "Overview" }).locator("#op-1");
  await expect(operation).toContainText("performed future protocol operation");
  await operation.getByRole("button", { name: "Raw", exact: true }).click();
  await expect(operation.locator("pre")).toContainText('"type": "future_protocol_operation"');
  await expect(operation.locator("pre")).toContainText('"preserved": true');
});

test("malformed XDR preserves transaction details, failure status and raw inspection", async ({ page }) => {
  await page.goto(`/tx/${TX.malformed}`);
  await expect(page.getByRole("heading", { name: "Transaction details" })).toBeVisible();
  const overview = page.getByRole("tabpanel", { name: "Overview" });
  await expect(overview.getByText("Failed. The fee was still charged.", { exact: true })).toBeVisible();
  await expect(overview.locator("#op-1")).toContainText("12.5000001");
  await page.getByRole("tab", { name: "XDR", exact: true }).click();
  await page.getByRole("button", { name: "Raw XDR", exact: true }).click();
  await expect(page.getByRole("tabpanel").locator("pre")).toHaveText(["malformed-xdr", "malformed-xdr"]);
});

test("RPC outage preserves envelope-decoded invocation and omits unavailable return data", async ({ page }) => {
  await page.goto(`/tx/${TX.noMeta}`);
  await expect(page.getByRole("heading", { name: "Transaction details" })).toBeVisible();
  const operation = page.getByRole("tabpanel", { name: "Overview" }).locator("#op-1");
  await expect(operation).toContainText("increment");
  await expect(operation).toContainText("9007199254740993");
  await expect(operation.getByText("Returned", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "XDR", exact: true }).click();
  await page.getByRole("button", { name: "Raw XDR", exact: true }).click();
  await expect(page.getByRole("tabpanel").locator("pre").first()).toHaveText(transactions[TX.noMeta].envelope_xdr);
});
