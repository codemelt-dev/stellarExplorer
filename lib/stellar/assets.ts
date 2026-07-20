import "server-only";
import { cache } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { horizon } from "./horizon";

export type AssetRecord = Horizon.ServerApi.AssetRecord;

/** Assets matching a code, most-held first. */
export const searchAssetsByCode = cache(
  async (code: string): Promise<AssetRecord[]> => {
    try {
      const page = await (await horizon())
        .assets()
        .forCode(code)
        .order("desc")
        .limit(10)
        .call();
      return page.records;
    } catch {
      return [];
    }
  },
);
