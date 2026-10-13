/**
 * Horizon paging tokens are TOIDs: ledger << 32 | tx order << 12 | op index.
 * The indexer keys rows by (ledger_sequence, tx_index) with the same 1-based
 * tx order, so one cursor format pages both sources.
 */
export function txCursor(ledger: number, txIndex: number): string {
  return ((BigInt(ledger) << 32n) | (BigInt(txIndex) << 12n)).toString();
}

export function ledgerCursor(sequence: number): string {
  return txCursor(sequence, 0);
}

export function parseCursor(token: string): { ledger: number; txIndex: number } | null {
  if (!/^\d{1,20}$/.test(token)) return null;
  const id = BigInt(token);
  return { ledger: Number(id >> 32n), txIndex: Number((id >> 12n) & 0xfffffn) };
}
