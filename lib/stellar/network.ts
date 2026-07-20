import "server-only";
import { cookies } from "next/headers";
import { getNetwork, type NetworkConfig, type NetworkId } from "./config";

export const NETWORK_COOKIE = "network";

export async function activeNetworkId(): Promise<NetworkId> {
  const value = (await cookies()).get(NETWORK_COOKIE)?.value;
  return value === "mainnet" ? "mainnet" : "testnet";
}

export async function activeNetwork(): Promise<NetworkConfig> {
  return getNetwork(await activeNetworkId());
}
