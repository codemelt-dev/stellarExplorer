![Astrolabe](.github/astrolabe.png)

# Astrolabe Explorer

The frontend of [Astrolabe](https://astrostellar.xyz), a Stellar block explorer and analytics platform. It is built by [Codemelt](https://codemelt.com) and funded by the Stellar Community Fund (SCF #45). Product docs are in the [Astrolabe GitBook](https://codemelt.gitbook.io/astrolabe-docs).

Every transaction, operation and contract call reads as a plain sentence, and the raw XDR is one toggle away. Mainnet data comes from our own indexer, [astrolabe-be](https://github.com/codemelt-dev/astrolabe-be). Testnet, and anything the indexer can't answer, comes from public Horizon and Stellar RPC.

Live at https://astrostellar.xyz

```text
                                 browser
                                    │
  Next.js app (Vercel) ─────────────┼──────────────────────────────────────┐
  │ app/ pages → lib/stellar/ (one module per domain) → withIndexer        │
  │ mainnet: indexer first, Horizon or RPC when it is off, fails or misses │
  │ testnet: Horizon and Stellar RPC                                       │
  └──────┬─────────────────────┬──────────────────┬──────────────────┬─────┘
         │                     │                  │                  │
  Astrolabe indexer         Horizon          Stellar RPC       public sources
  ClickHouse (SQL)          REST, SSE        Soroban data      DefiLlama, CoinGecko,
  PostgREST (REST)          live streams     testnet, fallback SEP-1 stellar.toml,
  mainnet only                                                 AWS ledger archive
```

One exception to that path: on testnet, or when the indexer fails, the browser streams the live operations feed and the ledger pulse straight from Horizon.

## What it shows

| Page | Route | What |
|---|---|---|
| Home | `/` | search, live ledger pulse, headline stats with XLM market data, per-ledger activity chart, recent ledgers, live operations feed, DeFi overview with top tokens, network growth (new accounts and assets per day) |
| Transactions | `/tx/[hash]`, `/transactions` | success or failure with the decoded reason, every operation as a sentence, Soroban arguments, return values and events, balance changes, fee bumps, raw XDR per operation; the list filters by operation type |
| Accounts | `/account/[id]` | balances, issuer names from stellar.toml, filterable history, signers, thresholds, flags, sponsorship, data entries; muxed (`M…`) addresses resolve to their base account |
| Contracts | `/contract/[id]`, `/contracts` | WASM hash and TTL, the interface parsed from the contract spec, events, decoded storage, WASM download, Stellar Asset Contract detection; a directory of active and all contracts |
| Assets | `/asset/[id]`, `/assets` | supply, holders, a holder map (top 100 as bubbles by share of supply, clustered by transfers between them in the last 90 days) and top holders; a ranked asset directory |
| Ledgers | `/ledger/[sequence]`, `/ledgers` | close metadata, transactions, previous and next ledger |
| DeFi | `/defi/[slug]` | per-protocol TVL and volume; recent trades on the Stellar DEX page |
| Search | `/search` | `G`/`M`/`C` addresses, transaction hashes, ledger numbers, asset codes and federation addresses (`name*domain`, resolved in the browser through the domain's `stellar.toml`) |

The site opens on mainnet. The header switches to testnet and back, and connects a wallet read-only (Freighter, xBull). Analytics and liquidity pools are placeholder pages until the indexer's full history lands.

The humanizer covers all 27 operation types (24 classic, plus `invoke_host_function`, `extend_footprint_ttl` and `restore_footprint`), with a safe fallback for anything unknown. Amounts stay `bigint` from the wire to the screen; no stroop math runs in floating point.

## Where the data comes from

| Data | Mainnet | Testnet |
|---|---|---|
| Ledgers, recent transactions | indexer (ClickHouse); Horizon fallback | Horizon |
| Contracts: summary, storage, interface, events, WASM | indexer (ClickHouse and PostgREST); RPC fallback. Events go back to go-live, 100 at a time: older batches load through `/api/contracts/[id]/events` when the last page is reached | Stellar RPC (recent events only) |
| Asset supply and holder count | indexer; Horizon fallback | Horizon |
| Top holders, holder map links, asset and contract directories | indexer only | not available |
| Accounts: balances, signers, flags, data entries | indexer (PostgREST); Horizon fallback | Horizon |
| Account history and "Your activity" | indexer (ClickHouse) through `/api/accounts/[id]/activity` for the latter; Horizon for history before 6 October 2026 and as fallback | Horizon |
| Transaction detail: operations, contract calls, return values, events, balance changes | indexer (ClickHouse); Horizon, with RPC and the AWS ledger archive for Soroban results, for transactions before 6 October 2026 and as fallback | Horizon, with RPC for Soroban results |
| Live ledger pulse | indexer, polled every second through `/api/ledgers/live`; Horizon SSE fallback | Horizon SSE |
| Live operations feed | indexer, polled every 20 seconds through `/api/operations/live`; Horizon SSE fallback | Horizon SSE |
| Network growth, account totals | indexer; stellar.expert fallback | same (always mainnet figures) |
| Top tokens | indexer: 7-day senders, holders, price from our pools (order book mid as fallback), XLM from the XLM / USDC pool | same (always mainnet) |
| Asset price | indexer: deepest pool against XLM or Circle USDC (pools under 1,000 XLM skipped), order book mid as fallback; XLM from the XLM / USDC pool | not shown |
| XLM price and market stats | CoinGecko | same |
| TVL, protocols, DEX volume and trades | DefiLlama, Horizon | same (always mainnet) |
| Issuer names and icons | SEP-1 `stellar.toml` from the issuer's home domain | same |

Indexer reads with another source go through `withIndexer` in [`lib/stellar/indexer/client.ts`](lib/stellar/indexer/client.ts). When the indexer isn't configured, fails or has no record, the page reads the old source instead. Reads with no other source (top holders, contract storage and creation, the directories) show an unavailable state instead.

### Request accounting

Every indexer read logs one line on the server, in production too:

```
[indexer] transaction: indexer 212ms
[indexer] contract CDL74R events: indexer 138ms
[indexer] account history: fallback (not indexed)
[indexer] transaction: fallback (failed) ClickHouse 503: ...
[horizon] tx raw bf74c998
```

`indexer` means the indexer answered. `fallback` means the old source did, and why. `[horizon] tx raw` is the XDR tab, the only Horizon read on an indexer-served transaction page. On Vercel: project, Logs, search `[indexer]`. Vercel keeps logs for a short time, so export them during a review window.

The indexed history starts at ledger 64,806,592 (6 October 2026), the indexer's go-live. Backfilling it to genesis is the next milestone.

## Layout

| Folder | What |
|---|---|
| [`app/`](app/) | the routes (App Router). Pages stay thin: they load data in server components and hand it to components |
| [`components/`](components/) | the UI. `stellar/` holds the domain pieces (`Address`, `Amount`, `Time`), `ui/` the shadcn/ui primitives, the rest one folder per area |
| [`lib/stellar/`](lib/stellar/) | all Stellar data access, one module per domain (`accounts`, `transactions`, `ledgers`, `contracts`, `assets`, ...), plus `humanize.ts` (operation to sentence) and the XDR decoders |
| [`lib/stellar/indexer/`](lib/stellar/indexer/) | the indexer client: ClickHouse and PostgREST queries and the `withIndexer` fallback |
| [`e2e/`](e2e/) | Playwright browser tests and their fixtures ([`README.md`](e2e/README.md)) |
| [`.github/workflows/`](.github/workflows/) | CI on every push and pull request: test lint, unit tests and browser tests |

## Design

### Decoded by default, raw on demand

Every value renders for a person first (`sent 120 USDC to GCYV…E3CV`), with the raw XDR or SCVal behind a toggle. A value that can't be decoded shows "Unrecognized value. View raw", never a wall of base64.

### Credentials stay on the server

The browser never talks to the indexer. Its URLs and login are read only in server code (`server-only` modules), are never `NEXT_PUBLIC_`, and never reach the client bundle. ClickHouse queries bind every value as a parameter; no SQL is built from user input.

### Three states on every data page

A loading skeleton, an empty state that says what to do next, and an error state that says what failed and offers a retry. Mobile down to 375px, visible keyboard focus, and `prefers-reduced-motion` respected.

## Run locally

```bash
bun install
bun dev
```

Open http://localhost:3000. It opens on mainnet and runs with no settings, on public Horizon. For the indexer, and a Soroban fallback, put these in `.env.local` (and in the Vercel project for deploys):

| Variable | Default | What |
|---|---|---|
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` | testnet Horizon |
| `NEXT_PUBLIC_RPC_URL` | `https://soroban-testnet.stellar.org` | testnet Stellar RPC |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | testnet | testnet network passphrase |
| `NEXT_PUBLIC_MAINNET_RPC_URL` | unset | mainnet RPC provider, the Soroban fallback (SDF runs no public one) |
| `INDEXER_CLICKHOUSE_URL` | unset | the indexer's SQL endpoint, server only |
| `INDEXER_API_URL` | unset | the indexer's REST API, server only |
| `INDEXER_USER`, `INDEXER_PASSWORD` | unset | the indexer login, server only |

Without the `INDEXER_*` settings, mainnet reads Horizon and RPC, the live pulse streams from Horizon, network growth comes from stellar.expert, top holders and the directories are unavailable, and the home page's Top tokens card shows its empty state.

```bash
bun run build       # production build
bun run lint
bun run test:unit   # Vitest: XDR and contract decoding, transaction flow, amounts, asset IDs, search parsing, paging
```

## Browser tests

```bash
bunx playwright install chromium
bun run test:e2e
```

Playwright builds the production app into `.next-e2e`, starts it on port 3100 and runs every scenario in desktop and mobile Chromium. Horizon, RPC, the indexer and the public sources all answer from deterministic fixtures, so no network, wallet, funded account or key is needed. The build takes a few minutes; GitHub Actions runs the suite on every push and pull request and keeps the HTML report, screenshots, videos and traces of failures for 14 days.

See [the coverage and fixture guide](e2e/README.md) for the scenarios and how to debug them.

## Known limitations

- The indexer covers mainnet only, from 6 October 2026; the full history backfill is next.
- Testnet rides public endpoints and their rate limits.

## Related

- [astrolabe-be](https://github.com/codemelt-dev/astrolabe-be): the indexer. Galexie ingestion, PostgreSQL with PostgREST, ClickHouse, and the `lab` setup CLI.
- [Astrolabe docs](https://codemelt.gitbook.io/astrolabe-docs/): roadmap and milestones.
