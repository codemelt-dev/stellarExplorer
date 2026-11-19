/**
 * `load` at most once per `ttlMs` for every caller in this server process.
 * Callers inside the window get the last result, ones arriving while it loads
 * wait on that same call. A failed load isn't kept. This is what a CDN's
 * s-maxage did for us on Vercel; a single self-hosted server has no CDN.
 */
export function shared<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  let last: { at: number; value: T } | null = null;
  return () => {
    if (last && Date.now() - last.at < ttlMs) return Promise.resolve(last.value);
    pending ??= load().then(
      (value) => {
        last = { at: Date.now(), value };
        pending = null;
        return value;
      },
      (error) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };
}
