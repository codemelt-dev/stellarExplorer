import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import nock from "nock";
import { responseFor, upstreamOrigins } from "./responses";

// Loaded only by Playwright's server command. No test hooks in app code.
const errorLog = resolve(".e2e-cache/network-errors.log");
const allowedHost = (host: string) =>
  /^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host);
nock.disableNetConnect();
nock.enableNetConnect(allowedHost);

function recordError(message: string) {
  appendFileSync(errorLog, `${message}\n`);
  console.error(`[e2e network] ${message}`);
}

for (const origin of upstreamOrigins) {
  for (const method of ["GET", "POST"]) {
    nock(origin)
      .persist()
      .intercept(/.*/, method)
      .reply(async function (uri, body) {
        try {
          const response = responseFor(
            new URL(uri, origin),
            method,
            body,
            this.req.headers,
          );
          if (response.delay)
            await new Promise((done) => setTimeout(done, response.delay));
          return [
            response.status,
            typeof response.body === "string"
              ? response.body
              : JSON.stringify(response.body),
            {
              "Content-Type": response.contentType ?? "application/json",
              "Cache-Control": "no-store",
            },
          ];
        } catch (error) {
          recordError(String(error));
          return [599, { error: String(error) }];
        }
      });
  }
}

nock.emitter.on(
  "no match",
  (request: {
    protocol?: string;
    hostname?: string;
    host?: string;
    path?: string;
    options?: { hostname?: string; host?: string };
  }) => {
    // Next's OG image renderer fetches an embedded WASM data URI, not a network resource.
    if (request.protocol === "data:") return;
    const host =
      request.hostname ||
      request.host ||
      request.options?.hostname ||
      request.options?.host ||
      "";
    if (allowedHost(host)) return;
    recordError(
      `Unmocked server request: ${host}${request.path ?? ""}`.slice(0, 500),
    );
  },
);
