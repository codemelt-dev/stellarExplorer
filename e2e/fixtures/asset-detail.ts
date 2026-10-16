import { Asset } from "@stellar/stellar-sdk";
import { ISSUER } from "./stellar";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export const ISSUED_ASSET = {
  code: "USDC",
  issuer: ISSUER,
  id: `USDC-${ISSUER}`,
  holders: "42",
  compactSupply: "1.0K",
  exactSupply: "1,000 USDC",
  contractId: new Asset("USDC", ISSUER).contractId(TESTNET_PASSPHRASE),
} as const;

export const MISSING_ASSET = {
  code: "ZZZ",
  issuer: ISSUER,
  id: `ZZZ-${ISSUER}`,
} as const;
