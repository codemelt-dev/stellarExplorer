import { Address, xdr } from "@stellar/stellar-sdk";
import {
  ACCOUNT, RECIPIENT, ISSUER, EMPTY_ACCOUNT, MISSING_ACCOUNT, UNAVAILABLE_ACCOUNT,
  CONTRACT, EMPTY_CONTRACT, MISSING_CONTRACT, UNAVAILABLE_EVENTS_CONTRACT, INVALID_MUXED,
  LEDGER, MISSING_TX, UNAVAILABLE_TX, TX, WASM_HASH, transactions, operationsFor,
  accountRecord, ledgerRecord, assets, contractEntry, codeEntry, resultMetaXdr, contractEvent, latestLedger,
} from "../fixtures/stellar";

export const HORIZON = "https://horizon.e2e.invalid";
export const RPC = "https://rpc.e2e.invalid";
export const upstreamOrigins = [HORIZON, "https://horizon.stellar.org", RPC,
  "https://api.coingecko.com", "https://api.stellar.expert", "https://api.llama.fi"];

type FixtureResponse = { status: number; body: unknown; delay?: number; contentType?: string };
const ok = (body: unknown): FixtureResponse => ({ status: 200, body });
const missing = (): FixtureResponse => ({ status: 404, body: { type: "https://stellar.org/horizon-errors/not_found", title: "Resource Missing", status: 404, detail: "No fixture resource exists at this URL." } });
const unavailable = (): FixtureResponse => ({ status: 503, body: { title: "Service Unavailable", status: 503 } });
function collection(url: URL, records: unknown[]) {
  return ok({ _links: { self: { href: url.href }, next: { href: url.href }, prev: { href: url.href } }, _embedded: { records } });
}

// No default success response: a newly introduced/unrecognised request fails
// the suite, even when the application catches the upstream error gracefully.
export function responseFor(url: URL, method: string, rawBody?: unknown): FixtureResponse {
  if ([HORIZON, "https://horizon.stellar.org"].includes(url.origin) && method === "GET") {
    const parts = url.pathname.split("/").filter(Boolean);
    const [resource, id, child] = parts;
    if (resource === "transactions" && id) {
      if (id === MISSING_TX) return missing();
      if (id === UNAVAILABLE_TX) return unavailable();
      const tx = transactions[id];
      if (!tx) throw new Error(`Missing transaction fixture: ${id}`);
      if (child === "operations") return collection(url, operationsFor(id));
      if (child === "effects") {
        return collection(url, id === TX.payment || id === TX.feeBump ? [
          { _links: {}, id: "1", paging_token: "1", account: ACCOUNT, type: "account_debited", type_i: 3, asset_type: "native", amount: "12.5000001", created_at: tx.created_at },
          { _links: {}, id: "2", paging_token: "2", account: RECIPIENT, type: "account_credited", type_i: 2, asset_type: "native", amount: "12.5000001", created_at: tx.created_at },
        ] : []);
      }
      if (!child) return { ...ok(tx), delay: id === TX.slow ? 1800 : undefined };
    }
    if (resource === "transactions" && !id) return collection(url, [transactions[TX.payment], transactions[TX.soroban], transactions[TX.failed]]);
    if (resource === "accounts" && id) {
      if (id === MISSING_ACCOUNT || id === INVALID_MUXED) return missing();
      if (id === UNAVAILABLE_ACCOUNT) return unavailable();
      if (![ACCOUNT, RECIPIENT, ISSUER, EMPTY_ACCOUNT].includes(id)) throw new Error(`Missing account fixture: ${id}`);
      if (!child) return ok(accountRecord(id));
      if (child === "operations" || child === "payments") {
        const history = id === ACCOUNT ? [...operationsFor(TX.payment), ...operationsFor(TX.soroban)] : [];
        return collection(url, child === "payments" ? history.filter((op) => op.type === "payment") : history);
      }
    }
    if (resource === "ledgers") {
      if (!id && url.searchParams.get("cursor") === "now") {
        return { status: 200, contentType: "text/event-stream", body: `retry: 60000\ndata: ${JSON.stringify(ledgerRecord())}\n\n` };
      }
      if (!id) return collection(url, Array.from({ length: 10 }, (_, i) => ledgerRecord(LEDGER - i)));
      const sequence = Number(id);
      if (sequence === 999999) return missing();
      if (sequence === 999998) return unavailable();
      if (sequence < LEDGER - 10 || sequence > LEDGER + 1) throw new Error(`Missing ledger fixture: ${id}`);
      if (child === "transactions") return collection(url, sequence === LEDGER ? [transactions[TX.payment], transactions[TX.soroban], transactions[TX.failed]] : []);
      if (!child) return ok(ledgerRecord(sequence));
    }
    if (resource === "assets" && !id) {
      const code = url.searchParams.get("asset_code");
      if (code === "USDC") {
        const issuer = url.searchParams.get("asset_issuer");
        return collection(url, issuer ? assets.filter((asset) => asset.asset_issuer === issuer) : assets);
      }
      if (code === "ZZZ") return collection(url, []);
    }
    if (resource === "operations" && !id) {
      if (url.searchParams.get("cursor") === "now") return { status: 200, contentType: "text/event-stream", body: "retry: 60000\n: keepalive\n\n" };
      return collection(url, [...operationsFor(TX.payment), ...operationsFor(TX.soroban)]);
    }
    if (resource === "trades" && !id) return collection(url, []);
  }

  if (url.origin === RPC && method === "POST") {
    const request = (typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody) as {
      id: number | string; method: string;
      params?: { keys?: string[]; hash?: string; filters?: { contractIds?: string[] }[]; startLedger?: number };
    };
    const params = request.params ?? {};
    const rpc = (result: unknown) => ok({ jsonrpc: "2.0", id: request.id, result });
    if (request.method === "getLedgerEntries") {
      if (!params.keys?.length) throw new Error("getLedgerEntries requires keys");
      const entries = params.keys.flatMap((key) => {
        const decoded = xdr.LedgerKey.fromXDR(key, "base64");
        let value: string;
        if (decoded.switch().name === "contractData") {
          const id = Address.fromScAddress(decoded.contractData().contract()).toString();
          if (id === MISSING_CONTRACT) return [];
          if (![CONTRACT, EMPTY_CONTRACT, UNAVAILABLE_EVENTS_CONTRACT].includes(id)) throw new Error(`Missing contract fixture: ${id}`);
          if (decoded.contractData().key().switch().name !== "scvLedgerKeyContractInstance") throw new Error("Unexpected contract data key");
          value = contractEntry(id);
        } else if (decoded.switch().name === "contractCode" && decoded.contractCode().hash().equals(WASM_HASH)) {
          value = codeEntry;
        } else throw new Error(`Missing ledger entry fixture: ${key}`);
        return [{ key, xdr: value, lastModifiedLedgerSeq: LEDGER, liveUntilLedgerSeq: LEDGER + 10000 }];
      });
      return rpc({ entries, latestLedger: LEDGER });
    }
    if (request.method === "getLatestLedger") return rpc(latestLedger);
    if (request.method === "getEvents") {
      const id = params.filters?.[0]?.contractIds?.[0];
      if (id === UNAVAILABLE_EVENTS_CONTRACT) return unavailable();
      if (![CONTRACT, EMPTY_CONTRACT, MISSING_CONTRACT].includes(id ?? "")) throw new Error("Unexpected event filter");
      return rpc({ events: id === CONTRACT ? [contractEvent] : [], latestLedger: LEDGER, cursor: contractEvent.pagingToken });
    }
    if (request.method === "getTransaction") {
      if (params.hash === TX.noMeta) return unavailable();
      if (params.hash === TX.failedSoroban) return rpc({ status: "FAILED", latestLedger: LEDGER });
      if (params.hash === TX.soroban) return rpc({
        status: "SUCCESS", latestLedger: LEDGER, oldestLedger: LEDGER - 9900, ledger: LEDGER,
        createdAt: 1788264000, applicationOrder: 1, feeBump: false,
        envelopeXdr: transactions[TX.soroban].envelope_xdr, resultXdr: transactions[TX.soroban].result_xdr, resultMetaXdr,
      });
    }
  }

  // Ancillary homepage panels use explicit unavailable/empty fixtures. They
  // are outside this suite's scope and must never contact public aggregators.
  if (method === "GET") {
    if (url.origin === "https://api.coingecko.com" && url.pathname === "/api/v3/simple/price") return unavailable();
    if (url.origin === "https://api.stellar.expert") {
      if (url.pathname === "/explorer/public/ledger/ledger-stats") return ok([]);
      if (url.pathname === "/explorer/public/asset") return collection(url, []);
    }
    if (url.origin === "https://api.llama.fi" &&
      (url.pathname === "/v2/historicalChainTvl/Stellar" || url.pathname === "/overview/dexs/stellar" || /^\/(tvl|protocol|summary\/dexs)\/[a-z0-9-]+$/.test(url.pathname))) return unavailable();
  }
  throw new Error(`Unhandled fixture request: ${method} ${url.href}`);
}
