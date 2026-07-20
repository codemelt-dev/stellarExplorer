import { Networks } from "@stellar/stellar-sdk";

export type NetworkId = "testnet" | "mainnet";

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  horizonUrl: string;
  rpcUrl: string | null;
  passphrase: string;
}

const NETWORKS: Record<NetworkId, NetworkConfig> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    horizonUrl:
      process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
    passphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? Networks.TESTNET,
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    horizonUrl: "https://horizon.stellar.org",
    // SDF runs no public mainnet RPC - must be provided via env.
    rpcUrl: process.env.NEXT_PUBLIC_MAINNET_RPC_URL ?? null,
    passphrase: Networks.PUBLIC,
  },
};

/** MVP default. The header switcher is stubbed to testnet for the demo. */
export const DEFAULT_NETWORK: NetworkId = "testnet";

export function getNetwork(id: NetworkId = DEFAULT_NETWORK): NetworkConfig {
  return NETWORKS[id];
}
