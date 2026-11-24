import "server-only";
import { unstable_cache } from "next/cache";

/**
 * unstable_cache for live data. A stale entry is still handed out once while
 * it refreshes in the background, whatever its age, so after a quiet night a
 * page would open on yesterday's trades. Past `maxAge` (five revalidate
 * periods unless set) this loads fresh instead, and keeps the old entry only
 * if that load fails.
 */
export function freshCache<A extends unknown[], T>(
  load: (...args: A) => Promise<T>,
  key: string[],
  { revalidate, maxAge = revalidate * 5 }: { revalidate: number; maxAge?: number },
): (...args: A) => Promise<T> {
  // stamped entries get their own key, never mixed up with older plain ones
  const cached = unstable_cache(
    async (...args: A) => ({ at: Date.now(), value: await load(...args) }),
    [...key, "stamped"],
    { revalidate },
  );
  return async (...args: A) => {
    const hit = await cached(...args);
    if (Date.now() - hit.at <= maxAge * 1000) return hit.value;
    try {
      return await load(...args);
    } catch {
      return hit.value;
    }
  };
}
