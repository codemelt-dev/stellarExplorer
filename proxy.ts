import { NextResponse, type NextRequest } from "next/server";
import { PAGES_PER_MINUTE, RateLimit, clientIp, isCrawler } from "@/lib/guard";

// one server process, so these live as long as it does
const visitors = new RateLimit(PAGES_PER_MINUTE);
// a crawler is logged once an hour, not on every page it asks for
const crawlers = new RateLimit(0, 3_600_000);

export function proxy(request: NextRequest) {
  const ip = clientIp(request.headers);
  // dev and e2e run on localhost
  if (!ip) return NextResponse.next();

  const userAgent = request.headers.get("user-agent");
  if (isCrawler(userAgent)) {
    if (crawlers.hit(userAgent ?? "").first) {
      console.info(`[guard] crawler ${ip} ${userAgent ?? "(no user agent)"}`);
    }
    return new NextResponse("Crawling these pages is not allowed, see /robots.txt", { status: 403 });
  }

  const { over, first, retryAfterS } = visitors.hit(ip);
  if (over) {
    if (first) console.info(`[guard] over ${PAGES_PER_MINUTE}/min ${ip} ${userAgent}`);
    return new NextResponse("Too many pages at once, try again in a minute", {
      status: 429,
      headers: { "Retry-After": String(retryAfterS) },
    });
  }
  return NextResponse.next();
}

// the pages and routes that query the indexer on every visit. Prefetches
// stop at the loading screen and run no queries, so they don't count
export const config = {
  matcher: [
    {
      source: "/(tx|ledger|account|contract)/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    "/api/(accounts|contracts|tx)/:path*",
  ],
};
