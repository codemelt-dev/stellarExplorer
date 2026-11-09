// Rebuilding a pool's reserves day by day. A classic pool's reserves only
// change by what moves in and out of it, so each day ends with what the next
// one started with: walk back from today's. A Soroban pool reports its
// reserves in events, so a day without one kept the last day's

export type Reserves = [bigint, bigint];

/**
 * End-of-day reserves for each of `days` (oldest first, today last), walked
 * back from the reserves now through each day's net flow into the pool.
 * Null from the first day back that would go negative: flows are missing.
 */
export function walkBack(now: Reserves, flows: Map<string, Reserves>, days: string[]): Array<Reserves | null> {
  const out: Array<Reserves | null> = days.map(() => null);
  let current: Reserves = now;
  for (let i = days.length - 1; i >= 0; i--) {
    if (current[0] < 0n || current[1] < 0n) break;
    out[i] = current;
    const flow = flows.get(days[i]);
    if (flow) current = [current[0] - flow[0], current[1] - flow[1]];
  }
  return out;
}

/** Each day's value, or the latest earlier one's on a day without, starting from `before`. */
export function carryForward<T>(byDay: Map<string, T>, days: string[], before: T | null = null): Array<T | null> {
  let last: T | null = before;
  return days.map((day) => (last = byDay.get(day) ?? last));
}

/**
 * The run of consecutive days that ends today, from the UTC days with indexed
 * ledgers (oldest first). Walking back needs every transfer after a day.
 */
export function unbrokenDays(days: string[], today: string): string[] {
  if (days[days.length - 1] !== today) return [];
  let start = days.length - 1;
  while (start > 0 && Date.parse(days[start]) - Date.parse(days[start - 1]) === 86_400_000) start--;
  return days.slice(start);
}
