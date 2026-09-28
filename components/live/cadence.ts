// lists (ledgers, ops, list pages) update about every 4 ledgers so rows stay
// readable. The pulse and stats still tick every ledger
export const LIST_REFRESH_MS = 20_000;
export const LIST_REFRESH_LEDGERS = 4;
