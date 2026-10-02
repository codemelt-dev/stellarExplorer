import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

mkdirSync(".e2e-cache", { recursive: true });
writeFileSync(".e2e-cache/network-errors.log", "");
// Never reuse cached upstream responses from a previous test build.
rmSync(".next-e2e/cache/fetch-cache", { recursive: true, force: true });
const preload = pathToFileURL(resolve("e2e/support/register-mocks.mjs")).href;
const next = resolve("node_modules/next/dist/bin/next");

async function run(args, building = false) {
  const child = spawn(process.execPath, [next, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      // Inherited by Next's build workers too: static pages also use fixtures.
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${preload}`,
      E2E_ALLOW_FONT_DOWNLOADS: building ? "1" : "0",
    },
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    await new Promise((done, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) done();
        else reject(new Error(`Next ${args[0]} exited with ${signal ?? code}`));
      });
    });
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

await run(["build"], true);
await run(["start", "--hostname", "127.0.0.1", "--port", "3100"]);
