# Astrolabe

A human-first block explorer for the Stellar network.

**Decoded by default, raw on demand.** Every transaction, operation and contract call renders as a plain-language sentence, with raw XDR one toggle away for developers.

- **Live demo:** https://stellar-explorer-tau.vercel.app
- **Docs and grant application:** https://codemelt.gitbook.io/astrolabe-docs

## What the MVP does today

Built self-funded against public endpoints (Horizon, Stellar RPC), running on testnet by default with a network switcher.

- **Home:** live ledger pulse synced to real close times, headline stats (avg close time, TPS, ops), live operations feed with humanized one-liners, DeFi overview, network growth charts
- **Transactions:** success/failure verdict with decoded error reasons, every operation as a human sentence, Soroban invocations with decoded arguments, return values and contract events, fee-bump support, raw XDR behind a toggle
- **Accounts:** muxed address resolution, balances, issuer names via SEP-1 stellar.toml, filterable humanized history, signers, thresholds, flags, sponsorship, decoded data entries
- **Contracts:** WASM hash and TTL, function signatures parsed from the contract spec, recent events, decoded instance storage, Stellar Asset Contract detection
- **Ledgers:** close metadata, transaction list, prev/next navigation
- **Search:** G/M/C addresses, transaction hashes, ledger numbers and asset codes, with unit-tested query classification
- **Wallet:** read-only connect via Stellar Wallets Kit (Freighter, xBull)
- **DeFi:** chain TVL history, per-protocol dashboards and top tokens, sourced from public aggregators as an interim until our own indexer replaces them

The humanizer covers all 26 classic operation types plus Soroban host functions, with a safe fallback for anything unknown. Amounts stay bigint from wire to render; no floating-point stroop math anywhere.

## Current stack

- Next.js (App Router) + TypeScript, Tailwind CSS v4, shadcn/ui
- @stellar/stellar-sdk for XDR decoding and RPC access
- Horizon REST + SSE for classic data and live streaming
- Stellar RPC for everything Soroban
- Bun as package manager and runtime, deployed on Vercel

## Where the architecture is going

The MVP is a single Next.js app reading public endpoints. That is the ceiling the grant removes. Post-grant, Astrolabe splits into independent projects, each with its own repo, deploy pipeline and lifecycle:

```
astrolabe-web        Next.js frontend (this repo, renamed)
astrolabe-api        NestJS, public REST API and internal aggregates
astrolabe-indexer    Galexie ledger ingestion and history backfill
```

- **Frontend:** stays Next.js. Pages keep the same components; only the data layer swaps from public endpoints to our API.
- **Backend:** NestJS with TypeScript, sharing @stellar/stellar-sdk decoding with the indexer.
- **Database:** PostgreSQL as the system of record for entities (accounts, assets, contracts, verification metadata, alert subscriptions), ClickHouse for append-heavy analytics tables.
- **Data ownership:** ledger data flows from captive-core into our own database. Horizon is an interim bridge only; the funded indexer removes it along with the aggregator dependencies.

Milestones, budgets and acceptance criteria live in the [docs](https://codemelt.gitbook.io/astrolabe-docs).

## Running locally

```bash
bun install
bun dev
```

Open http://localhost:3000. Testnet works out of the box with no env vars. Optional overrides:

```bash
NEXT_PUBLIC_HORIZON_URL      # Horizon endpoint, defaults to testnet
NEXT_PUBLIC_RPC_URL          # Stellar RPC endpoint, defaults to testnet
NEXT_PUBLIC_MAINNET_RPC_URL  # mainnet RPC provider, unset by default
```

```bash
bun run build   # production build
```

## Known limitations

- Public endpoint rate limits apply; the MVP is testnet-focused
- Soroban events are limited to the recent public RPC window
- Federation resolution and dedicated asset pages are on the roadmap
- Full history and analytics need the funded indexer

See the [limitations page](https://codemelt.gitbook.io/astrolabe-docs/technical-architecture/limitations) for the complete list.
