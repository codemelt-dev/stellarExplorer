export type ResolvedQuery =
  | { type: "account"; id: string }
  | { type: "muxedAccount"; id: string }
  | { type: "contract"; id: string }
  | { type: "transaction"; hash: string }
  | { type: "ledger"; sequence: number }
  | { type: "federation"; address: string }
  | { type: "asset"; code: string; issuer?: string }
  | { type: "unknown"; query: string };

const BASE32 = /^[A-Z2-7]+$/;
const HEX64 = /^[0-9a-fA-F]{64}$/;
// SEP-2 federation: name*domain.tld (name may contain most chars except * and whitespace)
const FEDERATION = /^[^*\s]+\*[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Asset codes: 1–12 alphanumeric (Stellar allows alphanum4 / alphanum12)
const ASSET_CODE = /^[a-zA-Z0-9]{1,12}$/;

function isStrKey(input: string, prefix: string, length: number): boolean {
  return (
    input.length === length && input.startsWith(prefix) && BASE32.test(input)
  );
}

export function resolveQuery(raw: string): ResolvedQuery {
  const q = raw.trim();
  if (!q) return { type: "unknown", query: q };

  // StrKeys are case-sensitive uppercase base32; check before anything else.
  if (isStrKey(q, "G", 56)) return { type: "account", id: q };
  if (isStrKey(q, "M", 69)) return { type: "muxedAccount", id: q };
  if (isStrKey(q, "C", 56)) return { type: "contract", id: q };

  if (HEX64.test(q)) return { type: "transaction", hash: q.toLowerCase() };

  if (/^\d+$/.test(q)) {
    const seq = Number(q);
    if (Number.isSafeInteger(seq) && seq > 0) {
      return { type: "ledger", sequence: seq };
    }
  }

  if (FEDERATION.test(q)) return { type: "federation", address: q };

  // CODE-GISSUER form
  const dash = q.indexOf("-");
  if (dash > 0) {
    const code = q.slice(0, dash);
    const issuer = q.slice(dash + 1);
    if (ASSET_CODE.test(code) && isStrKey(issuer, "G", 56)) {
      return { type: "asset", code: code.toUpperCase(), issuer };
    }
  }

  if (ASSET_CODE.test(q)) return { type: "asset", code: q.toUpperCase() };

  return { type: "unknown", query: q };
}

/** Route for a resolved query, or null when it needs a search-results page. */
export function routeFor(resolved: ResolvedQuery): string | null {
  switch (resolved.type) {
    case "account":
    case "muxedAccount":
      return `/account/${resolved.id}`;
    case "contract":
      return `/contract/${resolved.id}`;
    case "transaction":
      return `/tx/${resolved.hash}`;
    case "ledger":
      return `/ledger/${resolved.sequence}`;
    case "federation":
      return `/search?q=${encodeURIComponent(resolved.address)}`;
    case "asset":
      return resolved.issuer
        ? `/asset/${resolved.code}-${resolved.issuer}`
        : `/search?q=${encodeURIComponent(resolved.code)}`;
    case "unknown":
      return null;
  }
}
