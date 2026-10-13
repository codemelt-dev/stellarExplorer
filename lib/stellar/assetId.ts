// how an asset is named across the app and in URLs. Pure and SDK-free so
// client components can use it too

/** Lumens, an issued asset, or a token that only exists as a Soroban contract. */
export type AssetIdentity =
  | { kind: "native"; code: "XLM" }
  | { kind: "issued"; code: string; issuer: string }
  | { kind: "contract"; contractId: string };

const CODE = /^[a-zA-Z0-9]{1,12}$/;
const ACCOUNT = /^G[A-Z2-7]{55}$/;
const CONTRACT = /^C[A-Z2-7]{55}$/;

/** From the indexer's asset key: "native", "CODE:ISSUER", or a contract id. */
export function fromAssetKey(key: string): AssetIdentity | null {
  if (key === "native") return { kind: "native", code: "XLM" };
  const [code, issuer, ...rest] = key.split(":");
  if (issuer && !rest.length && CODE.test(code) && ACCOUNT.test(issuer)) {
    return { kind: "issued", code, issuer };
  }
  return CONTRACT.test(key) ? { kind: "contract", contractId: key } : null;
}

export function assetKey(identity: AssetIdentity): string {
  if (identity.kind === "native") return "native";
  return identity.kind === "issued" ? `${identity.code}:${identity.issuer}` : identity.contractId;
}

/** Where an asset lives in the app. A Soroban-only token is a contract, so its page is the contract's. */
export function assetHref(identity: AssetIdentity): string {
  if (identity.kind === "native") return "/asset/XLM";
  return identity.kind === "issued"
    ? `/asset/${identity.code}-${identity.issuer}`
    : `/contract/${identity.contractId}`;
}

/** The `[id]` of /asset/[id]: "XLM" or "CODE-ISSUER". Null for anything else. */
export function parseAssetId(id: string): AssetIdentity | null {
  if (id === "XLM" || id === "native") return { kind: "native", code: "XLM" };
  const dash = id.indexOf("-");
  if (dash < 1) return null;
  const identity = fromAssetKey(`${id.slice(0, dash)}:${id.slice(dash + 1)}`);
  return identity?.kind === "issued" ? identity : null;
}
