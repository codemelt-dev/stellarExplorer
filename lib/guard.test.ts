import { describe, expect, it } from "vitest";
import { RateLimit, clientIp, isCrawler } from "./guard";

describe("isCrawler", () => {
  it("catches search and AI crawlers and scripts", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "python-requests/2.32.3",
      "curl/8.7.1",
      "Go-http-client/2.0",
      null,
      "",
    ]) {
      expect(isCrawler(ua)).toBe(true);
    }
  });

  it("lets browsers and link previews through", () => {
    for (const ua of [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (Linux; Android 13; CUBOT KINGKONG 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
    ]) {
      expect(isCrawler(ua)).toBe(false);
    }
  });
});

describe("clientIp", () => {
  it("prefers Cloudflare's header, then the first forwarded address", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.2, 172.68.1.1" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.3" }))).toBe("198.51.100.3");
  });

  it("is null for local requests", () => {
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "::1" }))).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "127.0.0.1" }))).toBeNull();
  });
});

describe("RateLimit", () => {
  it("allows the limit per window and flags the first hit over it", () => {
    let now = 0;
    const limit = new RateLimit(3, 60_000, () => now);
    expect([1, 2, 3].map(() => limit.hit("a").over)).toEqual([false, false, false]);
    expect(limit.hit("a")).toEqual({ over: true, first: true, retryAfterS: 60 });
    now = 30_000;
    expect(limit.hit("a")).toEqual({ over: true, first: false, retryAfterS: 30 });
    expect(limit.hit("b").over).toBe(false);
    now = 60_000;
    expect(limit.hit("a").over).toBe(false);
  });

  it("with a limit of 0 flags only the first hit of each window", () => {
    let now = 0;
    const once = new RateLimit(0, 3_600_000, () => now);
    expect(once.hit("ua").first).toBe(true);
    expect(once.hit("ua").first).toBe(false);
    now = 3_600_000;
    expect(once.hit("ua").first).toBe(true);
  });
});
