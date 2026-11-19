import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  Address,
  Asset,
  Networks,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

// Rechecks a saved live capture. This command does not fetch current data,
// launch a browser, or import the explorer's calculation/adapter functions.
const path =
  process.argv[2] ?? "docs/evidence/live-analytics-validation-2026-11-19.json";
const evidence = JSON.parse(readFileSync(path, "utf8"));
const issuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const usdc = `USDC:${issuer}`;
const nativeContract = Asset.native().contractId(Networks.PUBLIC);
const usdcContract = new Asset("USDC", issuer).contractId(Networks.PUBLIC);
const { afterLedger, throughLedger, afterTime, throughTime } = evidence.window;

function units(decimal) {
  assert.match(decimal, /^\d+(\.\d{1,7})?$/);
  const [whole, fraction = ""] = decimal.split(".");
  return BigInt(whole + fraction.padEnd(7, "0"));
}

function inWindow(ledger) {
  return ledger > afterLedger && ledger <= throughLedger;
}

function instance(sample) {
  assert.ok(!sample.reference.error);
  assert.equal(sample.reference.result.entries.length, 1);
  const entry = sample.reference.result.entries[0];
  const data = xdr.LedgerEntryData.fromXDR(entry.xdr, "base64").contractData();
  assert.equal(Address.fromScAddress(data.contract()).toString(), sample.id);
  const storage = new Map(
    data
      .val()
      .instance()
      .storage()
      .map((item) => {
        const key = scValToNative(item.key());
        return [Array.isArray(key) ? key[0] : key, scValToNative(item.val())];
      }),
  );
  return { ledger: entry.lastModifiedLedgerSeq, storage };
}

function netTrades(rows) {
  const operations = new Map();
  for (const row of rows) {
    assert.ok(inWindow(row.ledger_sequence));
    const key = `${row.ledger_sequence}:${row.tx_index}:${row.op_index}`;
    const assets = operations.get(key) ?? new Map();
    const asset = row.asset || row.contract_id;
    assets.set(asset, (assets.get(asset) ?? 0n) + BigInt(row.amount));
    operations.set(key, assets);
  }
  return [...operations.values()].filter((assets) => {
    const amounts = [...assets.values()];
    return (
      amounts.filter((n) => n > 0n).length === 1 &&
      amounts.filter((n) => n < 0n).length === 1
    );
  });
}

function gross(trades, asset) {
  return trades.reduce((sum, assets) => {
    const amount = assets.get(asset) ?? 0n;
    return sum + (amount < 0n ? -amount : amount);
  }, 0n);
}

function referenceEvents(sample) {
  let nextLedger = afterLedger + 1;
  const seen = new Set();
  const result = [];
  for (let i = 0; i < sample.eventRequests.length; i++) {
    const { params } = sample.eventRequests[i];
    const response = sample.eventResponses[i];
    assert.ok(!response.error);
    assert.equal(params.startLedger, nextLedger);
    assert.ok(params.endLedger - params.startLedger <= 10_000);
    assert.deepEqual(params.filters[0].contractIds, [sample.id]);
    // Smaller than the result limit, in an explicitly bounded <=10k-ledger
    // range: neither the result cap nor the RPC scan cap truncates this page.
    assert.ok(response.result.events.length < params.pagination.limit);
    assert.ok(response.result.oldestLedger <= params.startLedger);
    assert.ok(response.result.latestLedger >= params.endLedger - 1);
    for (const event of response.result.events) {
      assert.ok(
        event.ledger >= params.startLedger && event.ledger < params.endLedger,
      );
      assert.equal(event.contractId, sample.id);
      assert.ok(!seen.has(event.id));
      seen.add(event.id);
      result.push({
        ...event,
        topics: event.topic.map((value) =>
          scValToNative(xdr.ScVal.fromXDR(value, "base64")),
        ),
        decoded: scValToNative(
          xdr.ScVal.fromXDR(event.value.xdr ?? event.value, "base64"),
        ),
      });
    }
    nextLedger = params.endLedger;
  }
  assert.equal(nextLedger, throughLedger + 1);
  return result;
}

function checkDisplayedUsd(label, displayed, reference) {
  const match = /^\$(\d+(?:\.\d+)?)([KM]?)$/.exec(displayed);
  assert.ok(match, `Unsupported display format: ${displayed}`);
  const scale = { "": 1, K: 1_000, M: 1_000_000 }[match[2]];
  const shown = Number(match[1]) * scale;
  const decimals = match[1].split(".")[1]?.length ?? 0;
  const rounding = scale / 10 ** decimals / 2;
  assert.ok(
    Math.abs(shown - reference) <=
      reference * evidence.tolerances.poolUsdRelative + rounding,
    `${label}: ${displayed} vs reference $${reference}`,
  );
  console.log(
    `PASS ${label}: ${displayed}, reference $${reference.toFixed(2)} (2% + display rounding)`,
  );
}

assert.equal(evidence.network, "mainnet");
assert.equal(throughLedger - afterLedger, 17_280);
assert.equal(Date.parse(throughTime) - Date.parse(afterTime), 86_400_000);

const classic = evidence.classic;
assert.equal(classic.indexer.pool_id, classic.reference.id);
assert.equal(
  classic.indexer.last_modified_ledger,
  classic.reference.last_modified_ledger,
);
for (const [asset, amount] of [
  [classic.indexer.asset_a, classic.indexer.reserve_a],
  [classic.indexer.asset_b, classic.indexer.reserve_b],
]) {
  assert.equal(
    BigInt(amount),
    units(classic.reference.reserves.find((r) => r.asset === asset).amount),
  );
}
assert.equal(
  BigInt(classic.indexer.total_shares),
  units(classic.reference.total_shares),
);
assert.equal(classic.indexer.fee_bp, classic.reference.fee_bp);
assert.ok(classic.referencePages.some((page) => page.oldest <= afterTime));
assert.equal(
  new Set(classic.referenceTrades.map((r) => r.id)).size,
  classic.referenceTrades.length,
);
const classicTrades = netTrades(classic.transfers);
let horizonXlm = 0n;
for (const row of classic.referenceTrades) {
  assert.ok(
    row.ledger_close_time > afterTime && row.ledger_close_time <= throughTime,
  );
  assert.ok(
    row.base_liquidity_pool_id === classic.id ||
      row.counter_liquidity_pool_id === classic.id,
  );
  assert.ok(
    row.base_asset_type === "native" || row.counter_asset_type === "native",
  );
  const credit = row.base_asset_type === "native" ? "counter" : "base";
  assert.equal(row[`${credit}_asset_code`], "USDC");
  assert.equal(row[`${credit}_asset_issuer`], issuer);
  horizonXlm += units(
    row.base_asset_type === "native" ? row.base_amount : row.counter_amount,
  );
}
assert.equal(classicTrades.length, classic.referenceTrades.length);
assert.equal(gross(classicTrades, "native"), horizonXlm);
console.log(
  `PASS classic: aligned reserves/shares/fee; ${classicTrades.length} swaps and XLM volume match Horizon exactly`,
);

const soroswap = evidence.soroswap;
const pair = instance(soroswap);
assert.equal(pair.storage.get(0), nativeContract);
const sync = soroswap.indexerEvents.find(
  (e) => JSON.parse(e.topics[1] ?? "null")?.symbol === "sync",
);
assert.equal(sync.ledger_sequence, pair.ledger);
const syncData = new Map(
  JSON.parse(sync.data).map.map((e) => [e.key.symbol, BigInt(e.val.i128)]),
);
assert.equal(syncData.get("new_reserve_0"), pair.storage.get(2));
assert.equal(syncData.get("new_reserve_1"), pair.storage.get(3));
const swaps = referenceEvents(soroswap).filter(
  (e) => e.topics[0] === "SoroswapPair" && e.topics[1] === "swap",
);
const rpcXlm = swaps.reduce(
  (sum, e) => sum + e.decoded.amount_0_in + e.decoded.amount_0_out,
  0n,
);
const pairTrades = netTrades(soroswap.transfers);
assert.equal(gross(pairTrades, "native"), rpcXlm);
console.log(
  `PASS Soroswap: aligned reserves and exact XLM volume; ${pairTrades.length} operations / ${swaps.length} RPC swap events`,
);

const aquarius = evidence.aquarius;
const stable = instance(aquarius);
assert.equal(stable.storage.get("Fee"), aquarius.observedUi.feeBp);
assert.deepEqual(stable.storage.get("Decimals"), [7, 7]);
assert.equal(stable.storage.get("Tokens")[1], usdcContract);
const reserves = aquarius.indexerEvents.find(
  (e) => JSON.parse(e.topics[0]).symbol === "update_reserves",
);
assert.equal(reserves.ledger_sequence, stable.ledger);
assert.deepEqual(
  JSON.parse(reserves.data).vec.map((v) => BigInt(v.i128)),
  stable.storage.get("Reserves"),
);
const stableSwaps = referenceEvents(aquarius).filter(
  (e) => e.topics[0] === "trade",
);
const rpcUsdc = stableSwaps.reduce((sum, e) => {
  assert.ok(e.topics[1] === usdcContract || e.topics[2] === usdcContract);
  return sum + e.decoded[e.topics[1] === usdcContract ? 0 : 1];
}, 0n);
const stableTrades = netTrades(aquarius.transfers);
assert.equal(stableTrades.length, stableSwaps.length);
assert.equal(gross(stableTrades, usdc), rpcUsdc);
console.log(
  `PASS Aquarius: aligned reserves/fee/decimals and ${stableSwaps.length} swaps with exact USDC volume`,
);

const xlmUsd =
  Number(classic.indexer.reserve_b) / Number(classic.indexer.reserve_a);
checkDisplayedUsd(
  "classic TVL",
  classic.observedUi.tvl,
  (Number(classic.indexer.reserve_b) / 1e7) * 2,
);
checkDisplayedUsd(
  "classic volume",
  classic.observedUi.volume,
  (Number(horizonXlm) / 1e7) * xlmUsd,
);
checkDisplayedUsd(
  "Soroswap TVL",
  soroswap.observedUi.tvl,
  (Number(pair.storage.get(2)) / 1e7) * xlmUsd * 2,
);
checkDisplayedUsd(
  "Soroswap volume",
  soroswap.observedUi.volume,
  (Number(rpcXlm) / 1e7) * xlmUsd,
);
checkDisplayedUsd(
  "Aquarius TVL",
  aquarius.observedUi.tvl,
  stable.storage.get("Reserves").reduce((sum, n) => sum + Number(n) / 1e7, 0),
);
checkDisplayedUsd(
  "Aquarius volume",
  aquarius.observedUi.volume,
  Number(rpcUsdc) / 1e7,
);

const holders = evidence.holders;
assert.equal(
  holders.stateCounts.reduce((sum, row) => sum + Number(row.positive), 0),
  Number(holders.asset.holders),
);
assert.ok(holders.asset.holders >= 1_000);
const supply =
  holders.stateCounts.reduce((sum, row) => sum + BigInt(row.supply), 0n) +
  BigInt(holders.poolSupply.supply) +
  BigInt(holders.claimableSupply.supply);
assert.equal(supply, BigInt(holders.asset.supply));
assert.equal(holders.top100.length, 100);
assert.equal(holders.mapInput.length, 100);
assert.equal(holders.stateRanking.length, 100);
assert.equal(new Set(holders.top100.map((h) => h.holder)).size, 100);
for (let i = 0; i < 100; i++) {
  const indexed = holders.top100[i];
  const state = holders.stateRanking[i];
  const rendered = holders.mapInput[i];
  assert.equal(indexed.rank, i + 1);
  assert.equal(indexed.holder, state.holder);
  assert.equal(indexed.balance, state.amount);
  assert.equal(rendered.holder, indexed.holder);
  assert.equal(rendered.balance, indexed.balance);
  assert.equal(rendered.rank, indexed.rank);
  assert.ok(BigInt(indexed.balance) > 0n);
  if (i)
    assert.ok(BigInt(holders.top100[i - 1].balance) >= BigInt(indexed.balance));
  const percent = (Number(indexed.balance) / Number(supply)) * 100;
  assert.ok(
    percent - rendered.share >= -1e-10 && percent - rendered.share < 0.0001,
  );
}
const clicked = holders.top100[holders.observedUi.tooltipRank - 1];
assert.equal(clicked.holder, holders.observedUi.clickedNodeAccount);
assert.equal(
  holders.observedUi.observedDestination,
  `http://127.0.0.1:3000/account/${clicked.holder}`,
);
console.log(
  `PASS USDC: ${holders.asset.holders} positive holders, exact supply reconciliation, all 100 ranked balances and map shares`,
);

const totals = evidence.overview.indexerTotals.totals;
assert.deepEqual(totals.map((t) => t.protocol).sort(), [
  "aquarius",
  "classic",
  "soroswap",
]);
assert.equal(
  totals.reduce((sum, t) => sum + t.pools, 0),
  evidence.overview.observedUi.pools,
);
for (const row of totals) {
  assert.ok(row.tvlUsd > 0 && row.volume24hUsd > 0);
  if (row.protocol !== "classic") {
    const reference = evidence.overview.referenceTvl[row.protocol];
    assert.ok(reference > 0);
    console.log(
      `INFO ${row.protocol} TVL: $${row.tvlUsd.toFixed(2)} vs DefiLlama $${reference.toFixed(2)}; gap ${((row.tvlUsd / reference - 1) * 100).toFixed(2)}%`,
    );
  }
}
console.log(
  "PASS captured live evidence. Native browser observations are recorded, not re-executed by this command; reviewer sign-off and exhaustive chain coverage are not claimed.",
);
