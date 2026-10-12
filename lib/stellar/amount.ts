export const STROOPS_PER_LUMEN = 10_000_000n;

// "123456789.1234500" -> { int: "123,456,789", frac: "12345" }
export function formatAmount(amount: string): { int: string; frac: string } {
  const [rawInt = "0", rawFrac = ""] = amount.split(".");
  const negative = rawInt.startsWith("-");
  const digits = negative ? rawInt.slice(1) : rawInt;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = rawFrac.replace(/0+$/, "");
  return { int: (negative ? "-" : "") + grouped, frac };
}

// base units -> decimal string at a token's own precision, e.g. (1500, 3) -> "1.5".
// Bigint math, floats lose precision
export function unitsToDecimal(units: bigint | string | number, decimals: number): string {
  const value = typeof units === "bigint" ? units : BigInt(units);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const int = abs / scale;
  const frac =
    decimals > 0 ? (abs % scale).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

// stroops -> decimal string, e.g. 15000000 -> "1.5"
export function stroopsToLumens(stroops: bigint | string | number): string {
  return unitsToDecimal(stroops, 7);
}

// "37.3331825" -> "37.3332" at 4 decimals. Half-up on the digit string, bigint so no float drift
export function roundAmount(amount: string, decimals: number): string {
  const negative = amount.startsWith("-");
  const [int = "0", frac = ""] = (negative ? amount.slice(1) : amount).split(".");
  if (frac.length <= decimals) return amount;
  const scaled = BigInt(int + frac.slice(0, decimals)) + (Number(frac[decimals]) >= 5 ? 1n : 0n);
  if (scaled === 0n) return "0";
  const digits = scaled.toString().padStart(decimals + 1, "0");
  const out = decimals > 0 ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits;
  return (negative ? "-" : "") + out;
}
