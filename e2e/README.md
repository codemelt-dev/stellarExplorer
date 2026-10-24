# Explorer browser tests

These are browser E2E tests of the real Next.js production app against synthetic
upstream HTTP responses. Pages, React hydration, navigation, SDK parsing and
XDR decoding run normally. They do not validate live Horizon, RPC or indexer
deployments.

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
port free or set `E2E_PORT` to another local port. It never reuses a running
development or live server. Every run builds into `.next-e2e` and clears its
upstream data cache. No `.env` file is needed: the configuration overrides
Horizon, RPC and indexer settings with reserved `.invalid` hosts and synthetic
credentials. The test build uses Next's Google Fonts mock hook with a
valid font bundled in Next, so it does not download fonts. It selects Next's
webpack builder because Turbopack rejects a `node_modules` symlink that points
outside an isolated Git worktree. Initial dependency and browser installation
still require network access when they are not already cached. Font substitution
is limited to the E2E build; this suite makes no pixel or typography assertions.

## Coverage

Every scenario runs in desktop Chromium and Pixel 7 mobile Chromium emulation.

| Area                     | Browser assertions                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transaction search       | Whitespace trimming, uppercase hash normalization, decoded payment, ledger link                                                                                                 |
| Account search           | Exact balances, signers/thresholds, decoded account data, history filters and transaction navigation                                                                            |
| Contract search          | WASM hash/TTL, events, interface parameter names, storage, event-to-transaction navigation                                                                                      |
| Ledger search            | Transaction list, previous/next ledger, empty ledger, failed transaction link                                                                                                   |
| Asset search             | Code normalization, multiple issuers, holder counts, search-to-asset navigation, CODE-ISSUER filtering                                                                          |
| Asset details            | Issued asset supply and holders, issuer navigation, missing assets and invalid identifiers                                                                                      |
| Search recovery          | Blank input, invalid query escaping, correction after no results                                                                                                                |
| Soroban invocation       | Real envelope/result-meta/spec XDR, named argument, return value, events, raw toggle; i128 values above JavaScript's safe integer range                                         |
| Failure corpus           | Underfunded payment and trapped host function reasons, fees on failure, fee-bump envelope/payer/inner transaction, unknown operation fallback/raw JSON, malformed XDR           |
| Muxed accounts           | IDs zero and uint64 maximum, base-account resolution, filter links preserving muxed address, invalid checksum                                                                   |
| Missing/unavailable data | Missing transaction/account/contract/ledger with search recovery, Horizon 503 alerts, RPC metadata/events outages                                                               |
| Empty/loading states     | Account and filtered history, asset results, contract events/storage, SAC interface explanation, transaction operations, delayed transaction skeleton, invalid ledger sequences |
| Mainnet indexer          | Ledger list/detail, XLM supply and holders, authentication headers, missing-record and outage fallbacks, mainnet as the default, testnet gating and network switching                                   |

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
- The app opens on mainnet, but every browser context starts with a `network=testnet`
  cookie (`storageState` in `playwright.config.ts`), so search and explorer
  scenarios run on the configured Stellar testnet. Indexer scenarios switch to
  mainnet explicitly because the indexer fixtures represent mainnet data, and
  one clears the cookie to check that a first visit lands on mainnet. Both are synthetic browser coverage; this suite does not validate
  a live indexer, Horizon or RPC deployment.
- Indexer coverage uses ClickHouse ledger and asset records plus a PostgREST
  missing-contract lookup. It does not yet cover indexed contract WASM, events,
  storage or directory pagination.

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

The workflow lints the browser suite. Existing application lint failures are
outside this test-only work; the application's lint rules remain enabled.

The regression tests exposed and cover a fixed navigation defect: CODE-ISSUER
queries previously opened a nonexistent `/asset/...` route. They now use the
implemented search page with the issuer passed to Horizon's asset filter.

Live provider authentication, retention windows and current upstream response
shapes require a separate integration check with known records. Those checks are
outside this deterministic browser suite.
