// hand-rolled ScVal readers for the live feed, so the client bundle
// doesn't pull the whole stellar-sdk. Return null on anything weird.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    if (typeof atob === "function") {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/** CRC16-XMODEM, as used by strkey checksums. */
function crc16(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** version byte + 32-byte payload -> strkey (G.../C...). */
function strkeyEncode(versionByte: number, payload: Uint8Array): string {
  const body = new Uint8Array(1 + payload.length);
  body[0] = versionByte;
  body.set(payload, 1);
  const checksum = crc16(body);
  const full = new Uint8Array(body.length + 2);
  full.set(body);
  full[body.length] = checksum & 0xff; // little-endian
  full[body.length + 1] = checksum >> 8;
  return base32Encode(full);
}

const SCV_SYMBOL = 15;
const SCV_ADDRESS = 18;

/** ScVal(SCV_SYMBOL) XDR -> symbol text. */
export function decodeScSymbol(b64: string): string | null {
  const bytes = base64ToBytes(b64);
  if (!bytes || bytes.length < 8) return null;
  if (readU32(bytes, 0) !== SCV_SYMBOL) return null;
  const length = readU32(bytes, 4);
  if (length > 32 || bytes.length < 8 + length) return null;
  return new TextDecoder().decode(bytes.slice(8, 8 + length));
}

/** ScVal(SCV_ADDRESS) XDR -> G... or C... strkey. */
export function decodeScAddress(b64: string): string | null {
  const bytes = base64ToBytes(b64);
  if (!bytes || bytes.length < 8) return null;
  if (readU32(bytes, 0) !== SCV_ADDRESS) return null;
  const addressType = readU32(bytes, 4);
  if (addressType === 0) {
    // account: PublicKey = keyType(0) + 32 bytes ed25519
    if (bytes.length < 12 + 32 || readU32(bytes, 8) !== 0) return null;
    return strkeyEncode(48, bytes.slice(12, 12 + 32)); // 'G'
  }
  if (addressType === 1) {
    // contract: 32-byte hash
    if (bytes.length < 8 + 32) return null;
    return strkeyEncode(16, bytes.slice(8, 8 + 32)); // 'C'
  }
  return null;
}
