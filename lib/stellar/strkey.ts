const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// display-only base32 decode, no checksum validation
export function base32Decode(input: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) return new Uint8Array();
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export type AddressKind = "account" | "muxedAccount" | "contract" | "unknown";

export function addressKind(address: string): AddressKind {
  if (address.length === 56 && address.startsWith("G")) return "account";
  if (address.length === 69 && address.startsWith("M")) return "muxedAccount";
  if (address.length === 56 && address.startsWith("C")) return "contract";
  return "unknown";
}

/** GCYVWG2N...UBQMLWE3CV -> GCYV...E3CV */
export function truncateKey(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

// strkey payload without version byte and checksum, feeds the identicon
export function strkeyPayload(address: string): Uint8Array {
  const decoded = base32Decode(address);
  if (decoded.length < 4) return decoded;
  return decoded.slice(1, decoded.length - 2);
}
