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
valid font bundled in Next, so it does not download fonts, and builds with
webpack rather than Turbopack. Initial dependency and browser installation
still require network access when they are not already cached. Font substitution
is limited to the E2E build; this suite makes no pixel or typography assertions.

## Analytics: pools and holders

Run `bun run test:e2e:analytics-pools-and-holders` separately for the analytics acceptance
scenarios: classic/Soroswap/Aquarius pools, DeFi comparisons, top-100 holder
maps, SAC and Soroban token coverage, and failure states. The original suite
retains its provider-outage corpus. Both run in CI. Do not run them concurrently.

Run commands from the `stellarExplorer` directory. After the suite finishes,
open its report with `bun run test:e2e:analytics-pools-and-holders:report`.

See [the requirement matrix, adapter scope and live-validation procedure](../docs/analytics-pools-and-holders-testing.md).
Synthetic browser tests do not prove live reserve, TVL, volume or holder accuracy.
The separate [live validation report](../docs/live-analytics-validation.md) records those
checks for representative real pools and USDC. Recheck its saved capture with
`bun run test:evidence:live-analytics`; this does not make new network requests.

## GitHub Actions

[Explorer and analytics tests](../.github/workflows/playwright.yml) runs on pushes,
pull requests and manual dispatch. Once the workflow is on the default branch,
open the repository's **Actions → Explorer and analytics tests → Run workflow**
to start it manually.

The workflow creates three independent jobs:

- **Unit tests and captured evidence**: lints the test code, runs the unit suite,
  and rechecks both committed mainnet captures.
- **Browser tests / explorer**: runs the original explorer scenarios.
- **Browser tests / analytics-pools-and-holders**: runs the analytics scenarios.

Each browser job builds its own production app and runs desktop and mobile
Chromium. They use separate runners, so their builds, ports, fixtures and reports
cannot overwrite each other. A failure in one browser suite does not cancel the
other. Retried flaky tests still fail CI.

The run summary shows check outcomes and browser pass/fail/flaky/skipped counts.
Download these artifacts from the workflow run:

- `browser-report-explorer` and `browser-report-analytics-pools-and-holders`:
  HTML/JSON reports, failure screenshots/videos/traces and the network audit;
  retained for 14 days.
- `analytics-validation-evidence`: validation documentation, public mainnet
  captures, verifier scripts and execution logs; retained for 30 days.

No repository secrets, local `.env`, production indexer or external deployment
are required. The evidence job revalidates a saved capture; it does not make a
fresh live-data capture. A green workflow proves these automated checks passed
for its commit, not formal reviewer acceptance of other chosen pool or asset IDs.

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
| Mainnet indexer          | Ledger list/detail, XLM supply and holders, authentication headers, missing-record and outage fallbacks, mainnet as the default, testnet gating and network switching           |

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
- The original indexer corpus includes ledgers, assets, pools and DeFi totals.
  analytics adds token metadata/WASM and explicit empty event/storage responses; it
  does not establish event/storage pagination or live indexer correctness.

When adding a scenario, add a distinct fixture/ID and explicit response branch,
then assert the user-visible outcome in a spec. Do not stub pages or application
helpers, or replace an unsupported request with a blanket successful response.
Use locators and Playwright assertions to wait for UI changes; avoid fixed sleeps.
The delayed response fixture is intentional input for the loading-state test.

References: [Playwright network mocking](https://playwright.dev/docs/mock),
[Playwright web servers](https://playwright.dev/docs/test-webserver),
[Nock network isolation](https://github.com/nock/nock#disabling-requests).

## CI

`.github/workflows/playwright.yml` runs the locked install, test lint, the unit
suite and both browser projects on every push and pull request, and can be
started by hand. Production build and type errors fail the job. The HTML report
is always kept; failures also keep screenshots, video and traces, and the
network audit log is uploaded with every run. Results are under Actions →
**Playwright browser tests**.

## Limitations

The workflow lints the browser suite only; the application's own lint rules run
separately with `bun run lint`.

Live provider authentication, retention windows and current upstream response
shapes need a separate integration check with known records. They are outside
this deterministic browser suite.
