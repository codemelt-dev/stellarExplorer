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

// stroops -> decimal string, e.g. 15000000 -> "1.5". Bigint math, floats lose precision
export function stroopsToLumens(stroops: bigint | string | number): string {
  const value = typeof stroops === "bigint" ? stroops : BigInt(stroops);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const int = abs / STROOPS_PER_LUMEN;
  const frac = (abs % STROOPS_PER_LUMEN).toString().padStart(7, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}
