import { test as base, expect, type Page } from "@playwright/test";
import { responseFor } from "./responses";

export const test = base.extend<{ browserGuard: void }>({
  browserGuard: [
    async ({ context, page, baseURL }, use) => {
      const errors: string[] = [];
      const onPageError = (error: Error) =>
        errors.push(`Browser exception: ${error.message}`);
      page.on("pageerror", onPageError);
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === baseURL) return route.continue();
        try {
          const response = responseFor(
            url,
            request.method(),
            request.postData(),
            request.headers(),
          );
          await route.fulfill({
            status: response.status,
            contentType: response.contentType ?? "application/json",
            headers: {
              "access-control-allow-origin": "*",
              "cache-control": "no-store",
            },
            body:
              typeof response.body === "string"
                ? response.body
                : JSON.stringify(response.body),
          });
        } catch (error) {
          errors.push(String(error));
          await route.abort("blockedbyclient");
        }
      });
      await use();
      expect(
        errors,
        "No browser exceptions or unmocked external requests",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function search(page: Page, query: string) {
  await page.goto("/");
  const input = page
    .getByRole("main")
    .getByRole("searchbox", { name: "Search the Stellar network" });
  await input.fill(query);
  await input.press("Enter");
}
