import { readFileSync } from "node:fs";

export default function globalTeardown() {
  const errors = readFileSync(".e2e-cache/network-errors.log", "utf8").trim();
  if (errors) throw new Error(`Unexpected upstream requests (add explicit fixtures):\n${errors}`);
}
