import { test, expect } from "./support/test";
import { ISSUED_ASSET, MISSING_ASSET } from "./fixtures/asset-detail";

test("issued asset shows supply, holders, issuer and holder availability", async ({
  page,
}) => {
  await page.goto(`/asset/${ISSUED_ASSET.id}`);
  const main = page.getByRole("main");

  await expect(
    main.getByRole("heading", { name: ISSUED_ASSET.code, exact: true }),
  ).toBeVisible();
  await expect(main.getByText("issued asset", { exact: true })).toBeVisible();
  await expect(
    main.getByText(ISSUED_ASSET.holders, { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByText(ISSUED_ASSET.compactSupply, { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByText(ISSUED_ASSET.exactSupply, { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "Top holders", exact: true }),
  ).toBeVisible();
  await expect(main).toContainText(
    "The holder ranking is built by the indexer, which covers mainnet only. It isn't available on testnet.",
  );

  await main.locator(`a[href="/account/${ISSUED_ASSET.issuer}"]`).click();
  await expect(page).toHaveURL(`/account/${ISSUED_ASSET.issuer}`);
  await expect(
    page.getByRole("heading", { name: "Account", exact: true }),
  ).toBeVisible();
});

test("missing issued asset explains that no holders or supply were found", async ({
  page,
}) => {
  await page.goto(`/asset/${MISSING_ASSET.id}`);

  await expect(page.getByRole("main")).toContainText(
    `No asset ${MISSING_ASSET.code} from this issuer on testnet. It may live on another network, or nobody holds it yet.`,
  );
  await expect(
    page.getByRole("heading", { name: "Top holders", exact: true }),
  ).toHaveCount(0);
});

test("invalid asset ID explains the accepted address format", async ({
  page,
}) => {
  await page.goto("/asset/not-an-asset");

  await expect(page.getByRole("main")).toContainText(
    '"not-an-asset" isn\'t an asset. Assets are written CODE-ISSUER',
  );
  await expect(
    page.getByRole("heading", { name: "Top holders", exact: true }),
  ).toHaveCount(0);
});
