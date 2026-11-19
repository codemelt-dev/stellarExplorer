// Turning away crawlers and fast clients before a page runs its indexer
// queries. The backend allows us 3 ClickHouse queries at a time, and one
// crawler opening every tx page took all of them

/** Pages and routes per minute one visitor may open. */
export const PAGES_PER_MINUTE = 30;

const CRAWLER = /bot|crawl|spider|slurp|scrap|python|curl|wget|http-?client|go-http|okhttp|axios|node-fetch|undici|java\/|libwww/i;
// link previews fetch one page per shared link, so they stay welcome. Cubot is a phone
const ALLOWED = /slackbot|discordbot|telegrambot|twitterbot|linkedinbot|redditbot|whatsapp|skypeuripreview|cubot/i;

/** Search and AI crawlers and scripts, but not link previews. No user agent counts as a script. */
export function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return CRAWLER.test(userAgent) && !ALLOWED.test(userAgent);
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * The visitor's IP behind Cloudflare and nginx. Null for local requests (dev,
 * e2e), which aren't limited.
 */
export function clientIp(headers: Headers): string | null {
  const ip =
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0] ??
    headers.get("x-real-ip");
  const trimmed = ip?.trim();
  return trimmed && !LOOPBACK.has(trimmed) ? trimmed : null;
}

/**
 * Counts hits per key in fixed one-minute windows. `hit` says whether this
 * one is over the limit and, the first time it is in a window, `first`, so
 * each blocked visitor is logged once a minute.
 */
export class RateLimit {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private limit: number,
    private windowMs = 60_000,
    private now = () => Date.now(),
  ) {}

  hit(key: string): { over: boolean; first: boolean; retryAfterS: number } {
    const now = this.now();
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      if (this.windows.size > 10_000) this.prune(now);
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    w.count++;
    return {
      over: w.count > this.limit,
      first: w.count === this.limit + 1,
      retryAfterS: Math.ceil((w.start + this.windowMs - now) / 1000),
    };
  }

  private prune(now: number) {
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
