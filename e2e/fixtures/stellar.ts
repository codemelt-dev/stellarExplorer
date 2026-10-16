import { createHash } from "node:crypto";
import {
  Account, Address, Asset, Keypair, Memo, MuxedAccount, Networks,
  Operation, StrKey, TransactionBuilder, nativeToScVal, xdr,
} from "@stellar/stellar-sdk";

// Entirely synthetic, deterministic data. These keys never hold funds and no
// transaction is submitted. Keep wire-format fixtures independent of app code.
const signer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const feePayer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3));
export const ACCOUNT = signer.publicKey();
export const RECIPIENT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2));
export const ISSUER = feePayer.publicKey();
export const EMPTY_ACCOUNT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 4));
export const MISSING_ACCOUNT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 5));
export const UNAVAILABLE_ACCOUNT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 6));
export const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 7));
export const MISSING_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 8));
export const EMPTY_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 9));
export const UNAVAILABLE_EVENTS_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 10));
export const MUXED_ZERO = new MuxedAccount(new Account(ACCOUNT, "0"), "0").accountId();
export const MUXED_MAX = new MuxedAccount(new Account(ACCOUNT, "0"), "18446744073709551615").accountId();
export const INVALID_MUXED = MUXED_MAX.slice(0, -1) + (MUXED_MAX.endsWith("A") ? "B" : "A");
export const LEDGER = 60_000;
export const CLOSED_AT = "2026-09-01T12:00:00Z";
export const MISSING_TX = "e".repeat(64);
export const UNAVAILABLE_TX = "f".repeat(64);

function envelope(sequence: number, operation: xdr.Operation) {
  const tx = new TransactionBuilder(new Account(ACCOUNT, String(sequence)), {
    fee: "100", networkPassphrase: Networks.TESTNET,
  }).addOperation(operation).addMemo(Memo.text("Browser fixture")).setTimeout(0).build();
  tx.sign(signer);
  return tx;
}

const payment = () => Operation.payment({ destination: RECIPIENT, asset: Asset.native(), amount: "12.5000001" });
const invocation = () => Operation.invokeContractFunction({
  contract: CONTRACT, function: "increment",
  args: [nativeToScVal(9007199254740993n, { type: "i128" })],
});
const paymentTx = envelope(100, payment());
const failedTx = envelope(101, payment());
const sorobanTx = envelope(102, invocation());
const failedSorobanTx = envelope(103, invocation());
const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(ISSUER, "200", paymentTx, Networks.TESTNET);
feeBumpTx.sign(feePayer);
const unknownTx = envelope(104, Operation.bumpSequence({ bumpTo: "200" }));
const malformedTx = envelope(105, payment());
const slowTx = envelope(106, payment());
const emptyTx = envelope(107, payment());
const noMetaTx = envelope(108, invocation());

export const TX = {
  payment: paymentTx.hash().toString("hex"),
  failed: failedTx.hash().toString("hex"),
  soroban: sorobanTx.hash().toString("hex"),
  failedSoroban: failedSorobanTx.hash().toString("hex"),
  feeBump: feeBumpTx.hash().toString("hex"),
  unknown: unknownTx.hash().toString("hex"),
  malformed: malformedTx.hash().toString("hex"),
  slow: slowTx.hash().toString("hex"),
  empty: emptyTx.hash().toString("hex"),
  noMeta: noMetaTx.hash().toString("hex"),
};

function result(operation: xdr.OperationResultTr, successful: boolean) {
  const results = [xdr.OperationResult.opInner(operation)];
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString("100"),
    result: successful ? xdr.TransactionResultResult.txSuccess(results) : xdr.TransactionResultResult.txFailed(results),
    ext: new xdr.TransactionResultExt(0),
  }).toXDR("base64");
}
const paymentSuccess = result(xdr.OperationResultTr.payment(xdr.PaymentResult.paymentSuccess()), true);
const paymentFailure = result(xdr.OperationResultTr.payment(xdr.PaymentResult.paymentUnderfunded()), false);
const hostFailure = result(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped()), false);
const hostSuccess = result(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32))), true);
const feeBumpSuccess = new xdr.TransactionResult({
  feeCharged: xdr.Int64.fromString("400"),
  result: xdr.TransactionResultResult.txFeeBumpInnerSuccess(new xdr.InnerTransactionResultPair({
    transactionHash: paymentTx.hash(),
    result: new xdr.InnerTransactionResult({
      feeCharged: xdr.Int64.fromString("0"),
      result: xdr.InnerTransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.payment(xdr.PaymentResult.paymentSuccess()))]),
      ext: new xdr.InnerTransactionResultExt(0),
    }),
  })),
  ext: new xdr.TransactionResultExt(0),
}).toXDR("base64");

export const transactions = Object.fromEntries([
  paymentTx, failedTx, sorobanTx, failedSorobanTx, feeBumpTx, unknownTx, malformedTx, slowTx, emptyTx, noMetaTx,
].map((tx, index) => {
  const hash = tx.hash().toString("hex");
  const successful = hash !== TX.failed && hash !== TX.failedSoroban && hash !== TX.malformed;
  return [hash, {
    // Horizon's ledger link makes the SDK expose the numeric value as ledger_attr.
    _links: { ledger: { href: `https://horizon.e2e.invalid/ledgers/${LEDGER}` } },
    id: hash, hash, paging_token: String(1000 + index), successful,
    ledger: LEDGER, created_at: CLOSED_AT, source_account: ACCOUNT,
    source_account_sequence: "innerTransaction" in tx ? tx.innerTransaction.sequence : tx.sequence,
    fee_account: hash === TX.feeBump ? ISSUER : ACCOUNT,
    fee_charged: hash === TX.feeBump ? "400" : "100", max_fee: hash === TX.feeBump ? "400" : "100",
    operation_count: hash === TX.empty ? 0 : 1,
    envelope_xdr: hash === TX.malformed ? "malformed-xdr" : tx.toXDR(),
    result_xdr: hash === TX.malformed ? "malformed-xdr" : hash === TX.feeBump ? feeBumpSuccess : hash === TX.failed ? paymentFailure : hash === TX.failedSoroban ? hostFailure :
      [TX.soroban, TX.noMeta].includes(hash) ? hostSuccess : paymentSuccess,
    fee_meta_xdr: "AAAAAA==", memo_type: "text", memo: "Browser fixture",
    signatures: tx.signatures.map((signature) => signature.signature().toString("base64")),
    ...(hash === TX.feeBump ? {
      fee_bump_transaction: { hash, signatures: [] },
      inner_transaction: { hash: TX.payment, max_fee: "100", signatures: [] },
    } : {}),
  }];
}));

export function operationsFor(hash: string) {
  if (hash === TX.empty) return [];
  const isSoroban = [TX.soroban, TX.failedSoroban, TX.noMeta].includes(hash);
  return [{
    _links: {}, id: `257698037760001-${hash.slice(0, 8)}`, paging_token: "257698037760001",
    transaction_hash: hash, transaction_successful: transactions[hash]?.successful ?? true,
    source_account: ACCOUNT, created_at: CLOSED_AT,
    type: isSoroban ? "invoke_host_function" : hash === TX.unknown ? "future_protocol_operation" : "payment",
    type_i: isSoroban ? 24 : hash === TX.unknown ? 99 : 1,
    ...(isSoroban ? { function: "HostFunctionTypeInvokeContract", parameters: [], address: CONTRACT } :
      hash === TX.unknown ? { future_field: { preserved: true } } :
        { from: ACCOUNT, to: RECIPIENT, asset_type: "native", amount: "12.5000001" }),
  }];
}

export function accountRecord(id: string) {
  return {
    _links: { data: { href: `https://horizon.e2e.invalid/accounts/${id}/data/{key}`, templated: true } },
    id, account_id: id, sequence: "101", subentry_count: 1,
    last_modified_ledger: LEDGER, last_modified_time: CLOSED_AT,
    thresholds: { low_threshold: 1, med_threshold: 2, high_threshold: 3 },
    flags: { auth_required: false, auth_revocable: false, auth_immutable: false, auth_clawback_enabled: false },
    balances: [{ asset_type: "native", balance: "1234.5000001", buying_liabilities: "0.0000000", selling_liabilities: "0.0000000" }],
    signers: [{ key: id, type: "ed25519_public_key", weight: 1 }],
    data: { note: Buffer.from("Browser test account").toString("base64") },
    num_sponsoring: 0, num_sponsored: 0,
  };
}

export function ledgerRecord(sequence = LEDGER) {
  return {
    _links: {}, id: "a".repeat(64), hash: "a".repeat(64), prev_hash: "b".repeat(64),
    paging_token: String(BigInt(sequence) * 4294967296n), sequence,
    closed_at: new Date(Date.parse(CLOSED_AT) + (sequence - LEDGER) * 5000).toISOString(),
    successful_transaction_count: sequence === LEDGER ? 2 : 0,
    failed_transaction_count: sequence === LEDGER ? 1 : 0,
    operation_count: sequence === LEDGER ? 3 : 0, tx_set_operation_count: sequence === LEDGER ? 3 : 0,
    total_coins: "105000000000.0000000", fee_pool: "100.0000000",
    base_fee_in_stroops: 100, base_reserve_in_stroops: 5000000, max_tx_set_size: 1000,
    protocol_version: 23, header_xdr: "",
  };
}

export const assets = [ISSUER, RECIPIENT].map((issuer, index) => ({
  _links: {}, asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: issuer,
  paging_token: `USDC_${issuer}_credit_alphanum4`,
  accounts: { authorized: index ? 8 : 42, authorized_to_maintain_liabilities: 0, unauthorized: 0 },
  balances: { authorized: "1000.0000000", authorized_to_maintain_liabilities: "0.0000000", unauthorized: "0.0000000" },
  claimable_balances_amount: "0.0000000", liquidity_pools_amount: "0.0000000",
  num_claimable_balances: 0, num_liquidity_pools: 0, amount: "1000.0000000", num_accounts: index ? 8 : 42,
  flags: { auth_required: false, auth_revocable: false, auth_immutable: false, auth_clawback_enabled: false },
}));

const event = new xdr.ContractEvent({
  ext: new xdr.ExtensionPoint(0),
  // SDK types describe this opaque optional hash as an array; XDR expects bytes.
  contractId: StrKey.decodeContract(CONTRACT) as unknown as xdr.ContractId,
  type: xdr.ContractEventType.contract(),
  body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({
    topics: [xdr.ScVal.scvSymbol("counter_updated")], data: nativeToScVal(9007199254740994n, { type: "i128" }),
  })),
});
export const resultMetaXdr = new xdr.TransactionMeta(3, new xdr.TransactionMetaV3({
  ext: new xdr.ExtensionPoint(0), txChangesBefore: [], operations: [new xdr.OperationMeta({ changes: [] })], txChangesAfter: [],
  sorobanMeta: new xdr.SorobanTransactionMeta({
    ext: new xdr.SorobanTransactionMetaExt(0), events: [event],
    returnValue: nativeToScVal(9007199254740994n, { type: "i128" }), diagnosticEvents: [],
  }),
})).toXDR("base64");

// A valid WASM module with the same contractspecv0 section a compiled Soroban
// contract carries. The app's SDK must actually parse it to name the argument.
const spec = xdr.ScSpecEntry.scSpecEntryFunctionV0(new xdr.ScSpecFunctionV0({
  doc: "", name: "increment", inputs: [new xdr.ScSpecFunctionInputV0({ doc: "", name: "value", type: xdr.ScSpecTypeDef.scSpecTypeI128() })],
  outputs: [xdr.ScSpecTypeDef.scSpecTypeI128()],
})).toXDR();
const sectionName = Buffer.from("contractspecv0");
const section = Buffer.concat([Buffer.from([sectionName.length]), sectionName, spec]);
const wasm = Buffer.concat([Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 0, section.length]), section]);
export const WASM_HASH = createHash("sha256").update(wasm).digest();

export function contractEntry(id: string) {
  return xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({
    ext: new xdr.ExtensionPoint(0), contract: new Address(id).toScAddress(),
    key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent(),
    val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({
      executable: id === EMPTY_CONTRACT ? xdr.ContractExecutable.contractExecutableStellarAsset() : xdr.ContractExecutable.contractExecutableWasm(WASM_HASH),
      storage: id === EMPTY_CONTRACT ? [] : [new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("counter"), val: nativeToScVal(9007199254740993n, { type: "i128" }) })],
    })),
  })).toXDR("base64");
}
export const codeEntry = xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({
  ext: new xdr.ContractCodeEntryExt(0), hash: WASM_HASH, code: wasm,
})).toXDR("base64");

export const contractEvent = {
  type: "contract", ledger: LEDGER, ledgerClosedAt: CLOSED_AT, contractId: CONTRACT,
  id: "0000257698037760000-0000000000", pagingToken: "0000257698037760000-0000000000",
  inSuccessfulContractCall: true, txHash: TX.soroban,
  topic: [xdr.ScVal.scvSymbol("counter_updated").toXDR("base64")],
  value: nativeToScVal(9007199254740994n, { type: "i128" }).toXDR("base64"),
};

// SDK v16 parses both XDR fields in getLatestLedger before requesting events.
const header = new xdr.LedgerHeader({
  ledgerVersion: 23, previousLedgerHash: Buffer.alloc(32),
  scpValue: new xdr.StellarValue({ txSetHash: Buffer.alloc(32), closeTime: xdr.Uint64.fromString("1788264000"), upgrades: [], ext: xdr.StellarValueExt.stellarValueBasic() }),
  txSetResultHash: Buffer.alloc(32), bucketListHash: Buffer.alloc(32), ledgerSeq: LEDGER,
  totalCoins: xdr.Int64.fromString("1050000000000000000"), feePool: xdr.Int64.fromString("1000000000"),
  inflationSeq: 0, idPool: xdr.Uint64.fromString("0"), baseFee: 100, baseReserve: 5000000, maxTxSetSize: 1000,
  skipList: Array.from({ length: 4 }, () => Buffer.alloc(32)), ext: new xdr.LedgerHeaderExt(0),
});
const closeMeta = new xdr.LedgerCloseMeta(0, new xdr.LedgerCloseMetaV0({
  ledgerHeader: new xdr.LedgerHeaderHistoryEntry({ hash: Buffer.alloc(32), header, ext: new xdr.LedgerHeaderHistoryEntryExt(0) }),
  txSet: new xdr.TransactionSet({ previousLedgerHash: Buffer.alloc(32), txes: [] }),
  txProcessing: [], upgradesProcessing: [], scpInfo: [],
}));
export const latestLedger = {
  id: "a".repeat(64), protocolVersion: 23, sequence: LEDGER, closeTime: "1788264000",
  headerXdr: header.toXDR("base64"), metadataXdr: closeMeta.toXDR("base64"),
};
