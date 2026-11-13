import { afterEach, describe, expect, it, vi } from "vitest";
import { shared } from "./shared";

afterEach(() => {
  vi.useRealTimers();
});

describe("shared", () => {
  it("loads once per window for every caller", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => load.mock.calls.length);
    const newest = shared(1000, load);

    expect(await Promise.all([newest(), newest(), newest()])).toEqual([1, 1, 1]);
    vi.advanceTimersByTime(999);
    expect(await newest()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(await newest()).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares a slow load even past the window", async () => {
    vi.useFakeTimers();
    let finish: (value: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    const newest = shared(1000, load);

    const first = newest();
    vi.advanceTimersByTime(5000);
    const second = newest();
    finish("rows");
    expect(await first).toBe("rows");
    expect(await second).toBe("rows");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("tries again after a failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("rows");
    const newest = shared(1000, load);

    await expect(newest()).rejects.toThrow("down");
    expect(await newest()).toBe("rows");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
