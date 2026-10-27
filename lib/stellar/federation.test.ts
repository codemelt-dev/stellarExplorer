import { describe, expect, it } from "vitest";
import { FederationError, federationServerOf, recordOf, resolveFederation } from "./federation";

const ACCOUNT = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ";

const TOML = `
VERSION="2.0.0"
NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
FEDERATION_SERVER="https://fed.example.com/federation"

[DOCUMENTATION]
ORG_NAME="Example"
`;

// answers each URL from a map; anything missing is a network failure
function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const route = routes[String(input)];
    if (!route) throw new TypeError("Failed to fetch");
    return route();
  }) as typeof fetch;
}

const TOML_URL = "https://example.com/.well-known/stellar.toml";
const LOOKUP_URL = "https://fed.example.com/federation?q=bob%2Ba%40mail.com*example.com&type=name";

describe("federationServerOf", () => {
  it("reads the top-level key", () => {
    expect(federationServerOf(TOML)).toBe("https://fed.example.com/federation");
    expect(federationServerOf(`FEDERATION_SERVER = 'https://fed.example.com'`)).toBe(
      "https://fed.example.com/",
    );
  });

  it("ignores the key inside a table, missing keys and plain http", () => {
    expect(federationServerOf(`[DOCUMENTATION]\nFEDERATION_SERVER="https://x.com"`)).toBeNull();
    expect(federationServerOf(`VERSION="2.0.0"`)).toBeNull();
    expect(federationServerOf(`FEDERATION_SERVER="http://fed.example.com"`)).toBeNull();
  });
});

describe("recordOf", () => {
  it("keeps the account and memo", () => {
    expect(recordOf({ account_id: ACCOUNT, memo_type: "id", memo: 42 })).toEqual({
      accountId: ACCOUNT,
      memo: "42",
      memoType: "id",
    });
    expect(recordOf({ stellar_address: "bob*example.com", account_id: ACCOUNT })).toEqual({
      accountId: ACCOUNT,
      memo: null,
      memoType: null,
    });
  });

  it("rejects responses without a valid account", () => {
    expect(recordOf(null)).toBeNull();
    expect(recordOf({ detail: "not found" })).toBeNull();
    expect(recordOf({ account_id: "not-an-account" })).toBeNull();
  });
});

describe("resolveFederation", () => {
  const address = "bob+a@mail.com*example.com";

  it("follows stellar.toml to the federation server", async () => {
    const fetcher = fakeFetch({
      [TOML_URL]: () => new Response(TOML),
      [LOOKUP_URL]: () => Response.json({ stellar_address: address, account_id: ACCOUNT }),
    });
    await expect(resolveFederation(address, fetcher)).resolves.toEqual({
      accountId: ACCOUNT,
      memo: null,
      memoType: null,
    });
  });

  it("says when the name is unknown, without a retry", async () => {
    const fetcher = fakeFetch({
      [TOML_URL]: () => new Response(TOML),
      [LOOKUP_URL]: () => new Response("not found", { status: 404 }),
    });
    const error = await resolveFederation(address, fetcher).catch((e: FederationError) => e);
    expect(error).toBeInstanceOf(FederationError);
    expect(error).toMatchObject({ retry: false, message: `example.com has no account for ${address}.` });
  });

  it("offers a retry when the domain doesn't answer", async () => {
    const error = await resolveFederation(address, fakeFetch({})).catch((e: FederationError) => e);
    expect(error).toMatchObject({ retry: true, message: "Couldn't read the stellar.toml of example.com." });
  });

  it("says when the domain has no federation server", async () => {
    const fetcher = fakeFetch({ [TOML_URL]: () => new Response(`VERSION="2.0.0"`) });
    const error = await resolveFederation(address, fetcher).catch((e: FederationError) => e);
    expect(error).toMatchObject({ retry: false, message: "example.com doesn't run a federation server." });
  });
});
