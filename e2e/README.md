# Explorer browser tests

These are browser E2E tests of the real Next.js production app against synthetic
upstream HTTP responses. Pages, React hydration, navigation, SDK parsing and
XDR decoding run normally. They do not validate the current RPC provider.

## Run

Use Node 22 and Bun 1.4.2 (the same versions as CI):

```bash
bun install --frozen-lockfile
bunx playwright install chromium
bun run test:unit
bun run test:e2e
bun run test:e2e --project=chromium --grep 'fee bump'
bun run test:e2e:ui
bun run test:e2e:report
```

On Linux, use `bunx playwright install --with-deps chromium` for browser system
dependencies. Playwright starts its own server on `127.0.0.1:3100`; leave that
port free. It never reuses a running development or live server. Every run builds
into `.next-e2e` and clears its upstream data cache. No `.env` file is needed:
the configuration overrides the Horizon/RPC URLs with reserved `.invalid` hosts.
The build still needs internet access for Google Fonts and dependency/browser
installation requires network access.

## Coverage

Every scenario runs in desktop Chromium and Pixel 7 mobile Chromium emulation.

| Area | Browser assertions |
| --- | --- |
| Transaction search | Whitespace trimming, uppercase hash normalization, decoded payment, ledger link |
| Account search | Exact balances, signers/thresholds, decoded account data, history filters and transaction navigation |
| Contract search | WASM hash/TTL, events, interface parameter names, storage, event-to-transaction navigation |
| Ledger search | Transaction list, previous/next ledger, empty ledger, failed transaction link |
| Asset search | Code normalization, multiple issuers, holder counts, issuer navigation, CODE-ISSUER filtering |
| Search recovery | Blank input, invalid query escaping, correction after no results |
| Soroban invocation | Real envelope/result-meta/spec XDR, named argument, return value, events, raw toggle; i128 values above JavaScript's safe integer range |
| Failure corpus | Underfunded payment and trapped host function reasons, fees on failure, fee-bump envelope/payer/inner transaction, unknown operation fallback/raw JSON, malformed XDR |
| Muxed accounts | IDs zero and uint64 maximum, base-account resolution, filter links preserving muxed address, invalid checksum |
| Missing/unavailable data | Missing transaction/account/contract/ledger with search recovery, Horizon 503 alerts, RPC metadata/events outages |
| Empty/loading states | Account and filtered history, asset results, contract events/storage, SAC interface explanation, transaction operations, delayed transaction skeleton, invalid ledger sequences |

## Fixture boundaries

- `fixtures/stellar.ts` builds deterministic wire records and XDR with the Stellar
  SDK. Synthetic keys have no funds; no transactions are submitted. The minimal
  WASM contains a real `contractspecv0` section. Expectations in specs use literal
  decoded values rather than the application's decoding helpers.
- `support/responses.ts` dispatches by origin, HTTP method, resource ID and RPC
  parameters. Each edge case has its own immutable ID, so parallel tests never
  change another test's server state. Unknown operations deliberately use a
  future Horizon type on a known envelope because today's SDK cannot encode a
  future protocol operation.
- `support/register-mocks.mjs` loads Nock before Next builds or starts, including
  build workers. This covers server components and static rendering; browser
  `page.route()` alone cannot intercept their requests.
- `support/test.ts` intercepts browser requests, including Horizon streaming,
  and rejects uncaught browser exceptions. Unexpected upstream calls fail the
  test or global teardown. There is no live-provider fallback.
- DeFi and market panels receive explicit empty/unavailable fixtures. Wallet
  extensions, aggregator accuracy, screenshots/pixel comparison, Firefox and
  WebKit are outside this suite's scope.

When adding a scenario, add a distinct fixture/ID and explicit response branch,
then assert the user-visible outcome in a spec. Do not stub pages or application
helpers, or replace an unsupported request with a blanket successful response.
Use locators and Playwright assertions to wait for UI changes; avoid fixed sleeps.
The delayed response fixture is intentional input for the loading-state test.

References: [Playwright network mocking](https://playwright.dev/docs/mock),
[Playwright web servers](https://playwright.dev/docs/test-webserver),
[Nock network isolation](https://github.com/nock/nock#disabling-requests).

## CI evidence and limitations

`.github/workflows/playwright.yml` runs the locked install, test lint, existing
unit suite and both browser projects on every push/PR, with a manual trigger too.
Production build/type errors fail the job. The HTML report is always retained;
failures retain screenshots, video and traces. The network audit log is uploaded
as well. Open Actions → **Playwright browser tests** after pushing these changes
and link that run for the deliverable. Local runs do not establish a public CI run.

The full application lint currently has unrelated React hook errors in
`MyActivity`, `NetworkSwitcher`, `ThemeToggle`, `WalletButton`, `LedgerPulse` and
`Time`, plus an unused-disable warning in `app/opengraph-image.tsx`. This workflow
lints the new browser suite; it does not disable the existing application rules.

The regression tests exposed and cover a fixed navigation defect: CODE-ISSUER
queries previously opened a nonexistent `/asset/...` route. They now use the
implemented search page with the issuer passed to Horizon's asset filter.

When the correct RPC arrives, retain this deterministic suite and add a separate
live integration job with known transaction/contract IDs. Verify provider auth,
network selection, retention windows and actual response shapes there, and do
the same-transaction comparison against StellarExpert. Dedicated asset detail
pages and the wider UX issue audit remain separate deliverable work.
