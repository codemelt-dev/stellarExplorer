// no stellar-sdk import here, keeps it out of the client bundle
export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

export const MAINNET_HORIZON_URL = "https://horizon.stellar.org";

export type ClientNetworkId = "testnet" | "mainnet";

// client-side mirror of the server's network cookie
export function getClientNetwork(): {
  id: ClientNetworkId;
  horizonUrl: string;
} {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)network=(mainnet|testnet)/);
    if (match?.[1] === "mainnet") {
      return { id: "mainnet", horizonUrl: MAINNET_HORIZON_URL };
    }
  }
  return { id: "testnet", horizonUrl: HORIZON_URL };
}

export function setClientNetwork(id: ClientNetworkId) {
  document.cookie = `network=${id};path=/;max-age=31536000;samesite=lax`;
}
