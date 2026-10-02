import "server-only";
import { cache } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";

export type AssetRecord = Horizon.ServerApi.AssetRecord;

/** Assets matching a code, most-held first. */
export const searchAssetsByCode = cache(
  async (code: string, issuer?: string): Promise<AssetRecord[]> => {
    try {
      let query = (await horizon())
        .assets()
        .forCode(code)
        .order("desc")
        .limit(10);
      if (issuer) query = query.forIssuer(issuer);
      const page = await query.call();
      return page.records;
    } catch {
      return [];
    }
  },
);
