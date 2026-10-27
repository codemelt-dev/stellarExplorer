import { resolveQuery } from "./resolveQuery";

// SEP-2 lookups run in the browser: stellar.toml and federation servers are
// required to allow any origin, and our server never fetches a domain a
// visitor typed

export interface FederationRecord {
  accountId: string;
  memo: string | null;
  memoType: string | null;
}

/** A lookup that failed, with a message the page can show as is. */
export class FederationError extends Error {
  /** Worth retrying: the domain or its server didn't answer. */
  retry: boolean;

  constructor(message: string, retry: boolean) {
    super(message);
    this.retry = retry;
  }
}

const TIMEOUT_MS = 8000;

/** FEDERATION_SERVER from a stellar.toml, top level only, https only. */
export function federationServerOf(toml: string): string | null {
  const top = toml.split(/^\s*\[/m)[0];
  const match = top.match(/^\s*FEDERATION_SERVER\s*=\s*["']([^"']+)["']/m);
  if (!match) return null;
  try {
    const url = new URL(match[1].trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The account a federation response points to, or null if it names none. */
export function recordOf(body: unknown): FederationRecord | null {
  if (!body || typeof body !== "object") return null;
  const { account_id, memo, memo_type } = body as Record<string, unknown>;
  if (typeof account_id !== "string") return null;
  const kind = resolveQuery(account_id).type;
  if (kind !== "account" && kind !== "muxedAccount") return null;
  return {
    accountId: account_id,
    memo: memo == null || memo === "" ? null : String(memo),
    memoType: typeof memo_type === "string" ? memo_type : null,
  };
}

/** Resolves name*domain through the domain's stellar.toml and federation server. */
export async function resolveFederation(
  address: string,
  fetcher: typeof fetch = fetch,
): Promise<FederationRecord> {
  const domain = address.slice(address.indexOf("*") + 1).toLowerCase();

  let toml: string;
  try {
    const res = await fetcher(`https://${domain}/.well-known/stellar.toml`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`stellar.toml ${res.status}`);
    toml = await res.text();
  } catch {
    throw new FederationError(`Couldn't read the stellar.toml of ${domain}.`, true);
  }

  const server = federationServerOf(toml);
  if (!server) {
    throw new FederationError(`${domain} doesn't run a federation server.`, false);
  }

  const url = new URL(server);
  url.searchParams.set("q", address);
  url.searchParams.set("type", "name");
  let res: Response;
  try {
    res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new FederationError(`The federation server of ${domain} didn't respond.`, true);
  }
  // servers answer an unknown name with 404, some with 400
  if (res.status >= 400 && res.status < 500) {
    throw new FederationError(`${domain} has no account for ${address}.`, false);
  }
  if (!res.ok) {
    throw new FederationError(`The federation server of ${domain} didn't respond.`, true);
  }
  const record = recordOf(await res.json().catch(() => null));
  if (!record) {
    throw new FederationError(`${domain} has no account for ${address}.`, false);
  }
  return record;
}
