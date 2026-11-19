# Live analytics validation — pools, DeFi and holders

Validated locally against mainnet on **19 November 2026**. The representative live checks below passed. The automated browser suite also passed **38/38 tests** on desktop and mobile Chromium; the repository unit suite passed **190/190 tests** (including 14 new analytics cases).

This is submission evidence for the tested samples, not formal reviewer sign-off. The brief allows the reviewer to choose other pool and asset IDs; those selections should be checked using the same procedure.

## Evidence and commands

From `stellarExplorer`:

```sh
bun run test:unit
bun run test:e2e:analytics-pools-and-holders
bun run test:e2e:analytics-pools-and-holders:report
bun run test:evidence:live-analytics
```

The first two commands execute automated tests with controlled data. The last command independently rechecks the [saved live records](evidence/live-analytics-validation-2026-11-19.json); it does **not** fetch fresh data or repeat browser interactions. Its implementation is [verify-live-analytics-evidence.mjs](../scripts/verify-live-analytics-evidence.mjs), which does not import the explorer's valuation or adapter helpers.

The [GitHub Actions workflow](../.github/workflows/playwright.yml) runs these checks on pushes and pull requests, with a manual trigger as well. Its independent jobs publish summaries and downloadable browser reports plus an `analytics-validation-evidence` artifact. See the [CI instructions](../e2e/README.md#github-actions). No production credentials are used; a hosted run has not yet been observed for these local changes.

The live capture contains public on-chain data, the bounded RPC event requests, reference URLs and read-only SQL. It contains no indexer hostname or credentials. The raw application HTML was not included because development responses can contain internal diagnostics.

## Pools: independent reserves and trading volume

| Sample                      | Independent state check                                                                                    | Independent volume check                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Classic XLM/USDC            | Both reserves, shares and 30 bp fee exactly match Horizon at ledger **65,563,143**                         | **1,898 swaps** and **1,044,229.008109 XLM** match Horizon exactly    |
| Soroswap XLM/EURC           | Both indexed sync reserves exactly match independently decoded RPC contract state at ledger **65,563,134** | **86,737.5804484 XLM** matches the protocol's RPC swap events exactly |
| Aquarius PYUSD/USDC, stable | Both reserves, 10 bp fee and seven-decimal metadata match RPC state at ledger **65,562,956**               | **4 swaps**, **153.4539705 USDC** match RPC trade events exactly      |

Pool IDs:

- Classic: `a468d41d8e9b8f3c7209651608b74b7db7ac9952dcae0cdf24871d1d9c7b0088`
- Soroswap: `CATUJXDUO7SSSTAKSUV5YU6RSTB4B5AVIHQDV26QTCXOB46T6SLMWNMY`
- Aquarius: `CDMH535JSD224YXPET3B4SJOLXTQQ24GRSCWACGYBKSH2DKFJYWI7SUW`

All volume comparisons use the identical interval **(65,545,847, 65,563,127]**, which in this capture is exactly **18 November 15:21:18 UTC to 19 November 15:21:18 UTC**. The verifier independently nets the indexer's raw transfer rows by operation and compares the resulting amounts with Horizon trades or decoded RPC protocol events. Deposits and withdrawals do not count as swaps.

Soroswap's 144 swap events occurred in 142 operations. The explorer counts operations, so its trade counter can be smaller than the number of protocol swap events even when volume matches exactly.

Horizon was paginated beyond the beginning of the interval. RPC events were fetched in two adjacent, explicitly bounded ranges of at most 10,000 ledgers, each below the result limit. A short page alone is not proof that RPC pagination is complete: Stellar RPC also has a [10,000-ledger scan limit](https://github.com/stellar/stellar-rpc/blob/main/CHANGELOG.md).

References: [classic pool on Horizon](https://horizon.stellar.org/liquidity_pools/a468d41d8e9b8f3c7209651608b74b7db7ac9952dcae0cdf24871d1d9c7b0088), [Gateway.fm Stellar RPC documentation](https://docs.gateway.fm/rpc/stellar/), and [Soroswap reserve storage keys](https://github.com/soroswap/core/blob/main/contracts/pair/src/storage.rs).

### Displayed USD values and tolerance

| Pool     | Observed page TVL | Recalculated reference TVL | Observed page volume | Recalculated reference volume |
| -------- | ----------------: | -------------------------: | -------------------: | ----------------------------: |
| Classic  |             $3.2M |              $3,200,274.38 |              $140.6K |                   $141,733.04 |
| Soroswap |           $377.0K |                $377,508.23 |               $11.8K |                    $11,772.88 |
| Aquarius |             $8.0M |              $8,029,840.76 |                 $153 |                       $153.45 |

The documented tolerance for these page/reference comparisons is **2% plus half the last displayed unit**. All six comparisons pass. These are separately timed live page observations, not unrounded application metrics at an atomic snapshot; the exact checks above apply to aligned raw state and trading amounts.

Reference pricing uses the independently fetched classic XLM/USDC reserve ratio, with USDC valued at $1. Constant-product TVL uses twice the native reserve's value. Aquarius's stable-pool benchmark values both USDC and PYUSD at $1. These are explicit valuation assumptions, not claims that stablecoin market prices are always exactly $1. The threshold is documented for this validation; it does not imply reviewer approval.

Native Chrome inspection confirmed that all three pages render live reserves, TVL, volume, protocol/fee labels and 30-day volume history. The classic pool's TVL history toggle was also exercised successfully.

## DeFi overview

The local page renders the own-index totals and the third-party comparison table. The recorded aggregate snapshot covers **579 pools: 500 classic, 75 Aquarius and 4 Soroswap**. Its exact own-index values were captured from the running application's analytics cache:

| Protocol |    Indexed TVL |  DefiLlama TVL | TVL difference | Indexed volume | DefiLlama volume |
| -------- | -------------: | -------------: | -------------: | -------------: | ---------------: |
| Classic  | $13,357,730.87 |     Not listed |              — |    $210,645.98 |       Not listed |
| Aquarius | $37,719,447.25 | $37,444,565.15 |         +0.73% |  $1,828,830.20 |       $1,813,781 |
| Soroswap |  $1,037,388.52 |  $1,006,954.37 |         +3.02% |     $12,735.37 |          $10,895 |

The protocol totals sum to **$52,114,566.64 TVL** and **$2,052,211.54 volume**. Reference reads and application cache updates are not atomic; the earlier visible page showed $52.2M and $2.0M. The captured comparisons are reported as differences, not certified equal provider figures. Coverage, prices, caching and rolling-time definitions differ, particularly for volume. Classic pools have no matching provider row; Blend and other external-only protocols are not included in our totals.

The source path is `loadPools` → `totalsOf` in [pools.ts](../lib/stellar/pools.ts): indexed reserves and transfers supply the own-index metrics. [defi.ts](../lib/stellar/defi.ts) fetches the separate comparison figures. The synthetic integration tests exercise this separation and exact aggregation; this live check verifies the real pages and records, not a second full reconstruction of every pool in the overview.

Provider endpoints: [Aquarius TVL](https://api.llama.fi/tvl/aquarius-stellar), [Soroswap TVL](https://api.llama.fi/tvl/soroswap), [Stellar DEX volumes](https://api.llama.fi/overview/dexs/stellar?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true).

## USDC holder map

Asset: `USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`.

The snapshot was copied from ledger **65,552,260**, closed **19 November 00:15:43 UTC**; the copy finished at 00:18:59 UTC. Holder aggregates are daily snapshots, not current-ledger balances.

- **734,051 holders** reconcile exactly: 687,658 positive trustline balances plus 46,393 positive SAC balances.
- The top 100 addresses and balances were independently rebuilt from `state_trustlines` and `state_sac_balances`. All 100 match `top_holders`, and all 100 match the live page's serialized map input.
- **331,200,352.802661 USDC supply** reconciles exactly to trustline balances, SAC balances, classic pool reserves and claimable balances. Pool reserves and claimable balances contribute to supply without becoming account-holder bubbles.
- All 100 map supply shares match their balance divided by this full supply, within the application's four-decimal truncation.
- Native browser inspection confirmed the top-100 map renders, expands to full screen and shows a tooltip with address, balance and supply share.
- Clicking the rank-3 bubble opened `/account/GCTSFIICPYZW2R6HWA25IWDHQYSFBJJUAXVYHGUQ7K64G54ZQ6OOJUF6`. Its tooltip showed **31,699,114.27 USDC**, **9.57%**, and the abbreviated address `GCTSFI…OOJUF6`.

This explains the earlier count mismatch with Horizon: trustline totals include zero balances, while the explorer counts positive holders and includes contract balances. Their timestamps also differ. The reconciliation above proves consistency with the underlying indexed snapshot, not a separate audit of all chain ingestion.

## Coverage and practical limits

The documented initial protocol set is **classic Stellar AMM, Soroswap and Aquarius**. Live pages were checked for each. Aquarius stable pools were checked live; concentrated and other adapter cases also have automated coverage.

- The overview selects 500 classic pools and searches up to 400 Soroban candidates. Do not claim exhaustive chain coverage from these tests.
- The sampled pool tokens use seven decimals. General arbitrary-decimal pool valuation remains a source limitation; nine-decimal token-holder handling is separately tested.
- Standard-token completeness and custom-token best-effort labels have automated tests; this live capture does not validate every token category or every asset.
- Visible addresses are abbreviated. Contract-holder bubbles route to contract pages, while G-address holders route to account pages. Those are the implemented behaviors.
- The first overview HTTP request returned a history-unavailable state; the subsequent native browser visit rendered its 30-day chart. This transient response is recorded rather than omitted.
- Mobile interactions are proven by the passing synthetic suite; this native live inspection was desktop only.

No production code was changed, no transactions were submitted and nothing was deployed for this validation.
