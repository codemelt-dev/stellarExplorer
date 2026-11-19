# Analytics: pools and holders — testing and acceptance evidence

Status on 19 November 2026: **38/38 browser tests and 190/190 unit tests passed; representative live validation also passed**. See the [live validation report](live-analytics-validation.md) for pool reserve/volume comparisons, documented USD tolerance, DeFi comparisons and the real USDC holder-map checks. Formal reviewer sign-off is not claimed.

This work tests the existing explorer. It does not change the analytics implementation, deploy a site, submit transactions, or claim that synthetic data proves live accuracy.

## Run the checks

From `stellarExplorer`, with Node 22 and Bun 1.4.2:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run test:unit
bun run test:e2e
bun run test:e2e:analytics-pools-and-holders
bun run test:evidence:analytics-pools-and-holders
bun run test:evidence:live-analytics
```

Open the browser report from the same directory with
`bun run test:e2e:analytics-pools-and-holders:report`.

The existing GitHub Actions workflow now runs both browser corpora. The analytics suite contains 19 scenarios, each run on desktop Chromium and Pixel 7 Chromium emulation (38 cases). Reports are written under `playwright-report/analytics-pools-and-holders`; failures retain screenshots, traces and video. No live credentials are required.

Do not run the two browser commands concurrently: they deliberately share port 3100 and the disposable `.next-e2e` build. Each starts a fresh production build and a strictly mocked server. analytics uses a separate immutable fixture corpus, so dashboard caches cannot mix successful comparison data with the original suite's provider-outage data. Unknown server requests fail the network audit; browser exceptions and unknown external browser requests fail the test.

## What the new tests prove

| Requirement                                        | Automated evidence                                                                                                                                           | Remaining acceptance evidence                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Classic pool reserves, shares, fee, TVL and volume | Exact calculation assertions; page fields, both charts, swap/deposit/withdrawal amounts and transaction links                                                | Reviewer-selected real pool compared at an identified ledger/time                       |
| Soroban pool analytics                             | Soroswap and Aquarius concentrated-pool pipeline and page scenarios; existing unit tests also cover Aquarius constant-product/stable inference               | Live pools for every declared adapter; independent state and volume comparison          |
| Own-index DeFi totals                              | Exact protocol and overall sums; HTTP origins restricted to the indexer for totals; comparison-only Blend excluded                                           | Verify the backend's ingestion/SQL results and the deployed data source                 |
| Comparison table                                   | Known DefiLlama TVL and volume beside our values; positive/negative differences; common-protocol comparison excludes classic pools and Blend                 | Timestamped comparison against the former provider on equivalent coverage/windows       |
| At least 1,000 holders, top 100 bubbles            | Synthetic stablecoin and RWA each have 1,200 holders and 125 ranked records; query returns 100; browser checks all displayed addresses and excludes rank 101 | Reviewer-selected real asset with independently verified holder count and ranking       |
| Hover/tap and click                                | Balance, supply share, displayed address and navigation to the actual account page; hide/show and zoom reset                                                 | Live-asset interaction evidence; tooltip/address precision decision below               |
| Classic/SAC/Soroban token coverage                 | Classic asset aggregates; SAC-to-classic-asset link; nine-decimal Soroban token; incomplete-history and custom-metadata labels                               | Backend reconciliation of trustlines, contract balances, mint/burn and transfer history |
| Failure behavior                                   | Missing/invalid/unsupported pools, indexer 503, unpriced pool, quiet pool, testnet gating                                                                    | Operational behavior of the live indexer                                                |

Calculation tests are in `lib/stellar/analytics-pools-and-holders.test.ts` (14 new cases). They run the real indexer HTTP client, pool/asset/contract transformations and pricing code against independent wire fixtures. They validate exact totals, net refunds, distinguish deposits and withdrawals, exclude single-sided rewards from displayed activity, and exercise a 100-node layout. They **do not execute ClickHouse SQL**, so SQL aggregation, swap deduplication and backend event ingestion still require integration evidence.

Browser tests are in `e2e/analytics-pools-and-holders.spec.ts`. Fixtures and dispatchers are under `e2e/fixtures/analytics.ts` and `e2e/support/analytics-responses.ts`. The WASM fixture is a small real spec-bearing module; the token cases test indexed metadata and holders, not execution or compliance of a deployed token contract.

### Independent fixture arithmetic

| Pool                           |        TVL | Volume | Trades |   Fee |
| ------------------------------ | ---------: | -----: | -----: | ----: |
| Classic XLM/USDC               | $4,000,000 |   $200 |      3 | $0.60 |
| Soroswap XLM/USDC              |   $400,000 |   $600 |      2 | $1.80 |
| Aquarius concentrated XLM/USDC |   $120,000 |   $100 |      1 | $0.10 |
| Total                          | $4,520,000 |   $900 |      6 | $2.50 |

The price fixture values XLM at $0.20. The Aquarius fixture holds 100,000 XLM and 100,000 USDC, so its two independently priced reserves total $120,000. Pool activity separately includes a refunded swap, a deposit, a withdrawal and a one-sided reward; only the first three should appear.

For the comparison table, DefiLlama has $500,000 Soroswap and $100,000 Aquarius. The overlapping protocols therefore compare $520,000 with $600,000 (-13.3%). Its $9,000,000 Blend figure must not enter our indexed totals. The holder fixture's largest balance is 25,000 of a 10,000,000 supply (0.25%).

## Initial adapter set found in this source

This describes implementation coverage, not a verified inventory of live protocol pools.

| Adapter             | Source                                                                  | Scope and limitations                                                                                                            |
| ------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Stellar classic AMM | Indexed pool state and transfers; daily copies/history                  | Two-asset pools; dashboard shortlist capped at 500 candidates                                                                    |
| Soroswap            | `SoroswapPair` / `sync` events; token transfers and indexed SAC backing | Two-token constant-product pairs; recent-event discovery; fee fixed at 30 bp in code                                             |
| Aquarius            | `update_reserves`, trade/liquidity topics, and `pool_state`             | Two-token constant-product, stable and concentrated pools; type/fee inference may be unavailable without a suitable recent trade |

Soroban discovery is capped at 400 candidate contracts holding trusted assets. Unpriced pools are excluded from aggregate TVL. The UI's top-100 pool list is a presentation limit, distinct from the aggregate candidate limits. Pools of more than two tokens are not decoded. Do not describe these totals as exhaustive chain coverage without measuring the omitted set.

## Live validation procedure

This is read-only. No wallet, funds or new transactions are required.

1. Record the deployed app URL, source revision, network, indexer tip, capture time and cache/snapshot times. Obtain read-only `INDEXER_CLICKHOUSE_URL`, `INDEXER_API_URL`, `INDEXER_USER`, `INDEXER_PASSWORD` through the normal secret configuration, never in the evidence document.
2. Accept the reviewer's classic pool ID, a covered Soroban pool ID and an asset with at least 1,000 holders. Before review, select representative examples for every declared adapter and token category as well. Synthetic fixture IDs are not review targets.
3. Capture the app values and raw indexer responses. Separately obtain classic pool state from Horizon/ledger records and Soroban state from the actual protocol contracts or a documented independent source. Check token identity, ordering and decimals before computing USD values.
4. Compare reserves at the same ledger or a demonstrably unchanged pool state. If snapshots cannot be aligned, mark the comparison **inconclusive** and repeat; do not call a timing difference a successful match.
5. Recalculate TVL from reserves and documented prices. Sum each swap once over identical time boundaries; exclude liquidity deposits, withdrawals and rewards. The app labels 17,280-ledger volume as approximately a day. A provider's exact rolling 24 hours is not automatically comparable.
6. Reconcile per-protocol totals with the covered pools, then reconcile the overview. Record omitted/unpriced pools. Compare against DefiLlama using equivalent protocol scope; external-only protocols and classic pools without a provider counterpart are not an accuracy comparison.
7. Verify the chosen asset's holder count and exact ranked balances against the same snapshot. Supply percentage uses the asset's full defined supply, not the sum of the top 100. Check zero-balance policy, issuer/contract holdings and mint/burn history. Exercise hover/tap and navigation in the running browser.
8. Save raw JSON/CSV, timestamps, reference URLs, screenshots, differences and the test report together. Only then mark the corresponding acceptance row passed.

### Comparison rules

- Reserve amounts, shares and holder balances: exact equality in integer base units at an aligned snapshot.
- Locally recalculated USD metrics: compare unrounded numbers using the declared price method; separately allow the UI's documented display rounding.
- Independent provider USD metrics: the brief does not specify a percentage tolerance. The live validation documents 2% plus display rounding for the sampled pool page/reference comparisons, with explicit price and timing assumptions. It is a test threshold, not reviewer approval. Aggregate DefiLlama differences are reported separately without claiming identical prices, scope or time windows.
- Missing references, mismatched time windows, undefined supply or unknown coverage are **inconclusive**, never an automatic pass or a zero.

Use this template for additional reviewer-selected targets; completed representative comparisons are in the [live validation report](live-analytics-validation.md):

| Target / network         | Metric                            | Our raw value | Reference value / URL | Ledger / interval | Price method | Tolerance | Difference | Result / explanation |
| ------------------------ | --------------------------------- | ------------- | --------------------- | ----------------- | ------------ | --------- | ---------- | -------------------- |
| Additional review target | Reserves / TVL / volume / holders | —             | —                     | —                 | —            | —         | —          | Not validated        |

## Acceptance risks to resolve with the implementation owner

These observations are not repaired by changing expected test values.

1. **Coverage:** 500 classic / 400 Soroban candidate limits and exclusions need quantified coverage evidence against the chain-level wording.
2. **Pool token precision:** pool valuation currently assumes seven decimals. Nine-decimal holder support is tested, but that does not prove arbitrary-decimal pool support.
3. **Activity interval:** 17,280 ledgers approximates 24 hours. Align reference windows instead of comparing unlike totals.
4. **Holder tooltip:** the address is abbreviated and balances are rounded in the visible tooltip (exact rounded amounts can have a title). The brief says address/balance without specifying abbreviation. The new interaction test records present behavior; it does not establish approval of that interpretation.
5. **Contract holders:** C-address nodes route to contract pages, while the brief literally says account pages. Confirm whether address-appropriate routing is acceptable.
6. **Incomplete standard tokens:** missing transfer history hides supply shares and labels balances best effort. The brief explicitly allows best effort for arbitrary custom tokens, so standard-token completeness needs proof or remediation.
7. **Backend source:** this checkout contains consumers of ClickHouse/PostgREST. It does not contain the backend aggregation implementation needed to prove trustline/contract-state reconstruction.

## Initial live sample checks (superseded by the full validation)

The read-only indexer settings became available in `.env` during the session. The following samples were then fetched on 19 November 2026. These are agent-selected examples, not the reviewer's final selections.

| Sample                                                                       | Result                                                 | Scope                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Classic XLM/USDC pool `a468d41d…c7b0088`                                     | **Matched exactly** at last-modified ledger 65,562,125 | Both reserves, total shares and fee versus Horizon                                                       |
| Soroswap contract `CATUJXDUO7SSSTAKSUV5YU6RSTB4B5AVIHQDV26QTCXOB46T6SLMWNMY` | **Matched exactly** at ledger 65,562,123               | Indexed sync-event reserves versus independent RPC contract-instance storage                             |
| Circle USDC                                                                  | **Valid candidate input**                              | Indexer reports 734,051 holders; top 100 are unique, positive, descending balances with contiguous ranks |

The first classic capture was at a different ledger from Horizon and was not accepted. A paired repeat returned the same last-modified ledger and exact values. Soroswap's indexed reserve-event ledger matched the independently fetched contract-instance modification ledger.

The independent Soroban endpoint is documented by [Gateway.fm](https://docs.gateway.fm/rpc/stellar/). Its raw XDR was decoded separately from the explorer's adapter. Numeric storage keys 2 and 3 are Reserve0 and Reserve1 in [Soroswap's public storage implementation](https://github.com/soroswap/core/blob/main/contracts/pair/src/storage.rs).

[Raw sample evidence](evidence/analytics-pools-and-holders-live-2026-11-19.json) contains public on-chain records and reference URLs, with no indexer hostname, login or password. Recheck it with `bun run test:evidence:analytics-pools-and-holders`; that command checks the saved capture, **not fresh live data**.

Horizon reports 2,561,252 USDC trustline accounts across its authorization categories, whereas the indexer reports 734,051 holders. Their supply figures also differ. Holder definitions and snapshot times must be reconciled before interpreting these differences. At that initial stage the ranking and page/volume checks were not complete. The subsequent [full validation](live-analytics-validation.md) rebuilds all 100 ranked balances from underlying snapshot tables, reconciles holder count and supply, checks native browser interactions, compares volume against independent Horizon/RPC records, and adds live Aquarius coverage.

## Local execution record

- Initial checkout: clean. No analytics production code changed by this testing work.
- Initial unit run: 167 tests passed; holder layout suite could not import the missing `d3-force` dependency. The local install was stale relative to the manifest. Declared dependencies were installed using npm without modifying the lockfile; CI remains on the frozen Bun lockfile.
- Expanded unit suite: **190 passed across 23 files**, including 14 new analytics cases.
- TypeScript and scoped ESLint checks passed. Prettier write and check passed on changed files.
- The production test build passed with **zero unexpected upstream requests** in the network audit. Next 16.4 asks npm for optional security-upgrade metadata; the fixture explicitly returns unavailable, never a fabricated successful vulnerability scan.
- Browser discovery: 38 cases listed successfully.
- Luca's first local browser run completed: **34 passed, 4 failed**. The failures were strict-selector errors: the standard-token balance (desktop and mobile), the incomplete-history label (desktop), and the quiet-pool empty state (desktop) each matched both the main page and duplicate content outside it. These checks now target the main page.
- The renamed suite's subsequent local run passed **38/38 cases**, with **0 failures, 0 flaky cases and 0 skipped cases**, across desktop Chromium and Pixel 7 Chromium emulation. Verified from the generated HTML report's embedded `report.json` and `test-results/analytics-pools-and-holders/.last-run.json`; execution took 23.28 seconds.
- Suite filenames, commands, scenario names and report paths now describe analytics, pools and holders. The successful execution report is at `playwright-report/analytics-pools-and-holders/index.html`. Prior failed-run traces remain under `test-results/deliverable-4` as historical evidence.
- This assistant session still cannot bind the local test server (`listen EPERM: operation not permitted 127.0.0.1:3100`), so browser execution must be started in Luca's local terminal. CI has not been triggered or observed. No deployment or cloud runner is required.
- Public-site evidence: the web tool and browser host were unavailable. A separate HTTP request following redirects to `https://astrostellar.xyz/defi` returned 404; confirm the current deployment URL before the live page review.
- Live indexer: read-only `.env` access was available by the final checks; sample reconciliations above passed. Credentials were used only for the configured indexer and were not copied into test fixtures or this report.

The automated test suite and representative [live validation evidence](live-analytics-validation.md) are ready for review. The live evidence supplies the checks that synthetic fixtures alone cannot establish. Final acceptance remains the reviewer’s decision, including their chosen pool/asset IDs and the documented coverage limits.
