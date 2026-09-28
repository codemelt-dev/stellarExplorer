import { StatsRow } from "./StatsRow";
import { getMarketStats } from "@/lib/stellar/market";

// fetches market facts on the server, the live half fills in client-side
export async function StatsRowServer() {
  const market = await getMarketStats();
  return <StatsRow market={market} />;
}
