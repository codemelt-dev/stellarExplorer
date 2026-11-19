import { describe, expect, it } from "vitest";
import { limiter } from "./limit";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("limiter", () => {
  it("never runs more than max at once and finishes everything in order", async () => {
    const run = limiter(2);
    let now = 0;
    let peak = 0;
    const started: number[] = [];
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        run(async () => {
          started.push(i);
          peak = Math.max(peak, ++now);
          await tick();
          now--;
          return i * 10;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(results).toEqual([0, 10, 20, 30, 40]);
  });

  it("frees the slot when a task fails", async () => {
    const run = limiter(1);
    await expect(run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(run(async () => "ok")).resolves.toBe("ok");
  });
});
