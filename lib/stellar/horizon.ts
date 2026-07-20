import { Horizon } from "@stellar/stellar-sdk";
import { activeNetwork } from "./network";

const servers = new Map<string, Horizon.Server>();

export function horizonFor(url: string): Horizon.Server {
  let server = servers.get(url);
  if (!server) {
    server = new Horizon.Server(url);
    servers.set(url, server);
  }
  return server;
}

// horizon client for the network selected in the cookie
export async function horizon(): Promise<Horizon.Server> {
  const network = await activeNetwork();
  return horizonFor(network.horizonUrl);
}
