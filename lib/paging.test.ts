import { describe, expect, it } from "vitest";
import { pageWindow } from "./paging";

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("first, last and the neighbours of the current page", () => {
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pageWindow(20, 45)).toEqual([1, "gap", 19, 20, 21, "gap", 45]);
  });

  it("a full run near either end", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, "gap", 10]);
    expect(pageWindow(3, 10)).toEqual([1, 2, 3, 4, "gap", 10]);
    expect(pageWindow(10, 10)).toEqual([1, "gap", 7, 8, 9, 10]);
    expect(pageWindow(8, 10)).toEqual([1, "gap", 7, 8, 9, 10]);
  });
});
