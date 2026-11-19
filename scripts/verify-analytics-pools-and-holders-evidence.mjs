import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";

// Rechecks captured evidence; it does not fetch fresh data or certify the UI.
const path =
  process.argv[2] ??
  "docs/evidence/analytics-pools-and-holders-live-2026-11-19.json";
const evidence = JSON.parse(readFileSync(path, "utf8"));
const units = (decimal) => {
  assert.match(decimal, /^\d+(\.\d{1,7})?$/);
  const [whole, fraction = ""] = decimal.split(".");
  return BigInt(whole + fraction.padEnd(7, "0"));
};

assert.equal(evidence.network, "mainnet");
const { indexer: pool, reference: classic } = evidence.classic;
assert.equal(pool.pool_id, classic.id);
assert.equal(
  pool.last_modified_ledger,
  classic.last_modified_ledger,
  "Pool states must be aligned",
);
for (const [asset, raw] of [
  [pool.asset_a, pool.reserve_a],
  [pool.asset_b, pool.reserve_b],
]) {
  const reserve = classic.reserves.find((r) => r.asset === asset);
  assert.ok(reserve, `Missing reference reserve ${asset}`);
  assert.equal(BigInt(raw), units(reserve.amount));
}
assert.equal(BigInt(pool.total_shares), units(classic.total_shares));
assert.equal(pool.fee_bp, classic.fee_bp);
console.log(
  `PASS classic pool: both reserves, shares and fee at ledger ${pool.last_modified_ledger}`,
);

const { indexer: pair, reference: rpc } = evidence.soroswap;
assert.ok(!rpc.error, "RPC reference must succeed");
assert.equal(rpc.result.entries.length, 1);
const entry = rpc.result.entries[0];
assert.equal(
  pair.reserve_ledger,
  entry.lastModifiedLedgerSeq,
  "Soroban states must be aligned",
);
const contractData = xdr.LedgerEntryData.fromXDR(
  entry.xdr,
  "base64",
).contractData();
assert.equal(
  Address.fromScAddress(contractData.contract()).toString(),
  pair.contract_id,
);
const storage = new Map(
  contractData
    .val()
    .instance()
    .storage()
    .map((item) => [scValToNative(item.key()), scValToNative(item.val())]),
);
const event = JSON.parse(pair.reserves).map;
// The protocol's public storage.rs assigns Reserve0=2 and Reserve1=3.
for (const [field, key] of [
  ["new_reserve_0", 2],
  ["new_reserve_1", 3],
]) {
  const value = event.find((item) => item.key.symbol === field)?.val.i128;
  assert.ok(value, `Missing event reserve ${field}`);
  assert.equal(BigInt(value), BigInt(storage.get(key)));
}
console.log(
  `PASS Soroswap: both event reserves equal independent contract state at ledger ${pair.reserve_ledger}`,
);

const holders = evidence.holders;
assert.ok(Number(holders.indexer.holders) >= 1000);
assert.equal(holders.top100.length, 100);
assert.equal(new Set(holders.top100.map((h) => h.holder)).size, 100);
for (const [i, holder] of holders.top100.entries()) {
  assert.equal(holder.rank, i + 1);
  assert.ok(BigInt(holder.balance) > 0n);
  if (i > 0)
    assert.ok(BigInt(holders.top100[i - 1].balance) >= BigInt(holder.balance));
}
const topSupply = holders.top100.reduce(
  (sum, h) => sum + BigInt(h.balance),
  0n,
);
assert.ok(topSupply <= BigInt(holders.indexer.supply));
console.log(
  `PASS holder input: ${holders.indexer.holders} reported holders, 100 unique descending ranked balances`,
);
console.log(
  "Not checked: rendered pages, independent holder ranking, USD prices, volume or protocol totals.",
);
