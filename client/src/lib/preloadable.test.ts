import { describe, expect, it } from "vitest";
import { preloadable } from "./preloadable";

const Page = () => null;

describe("preloadable", () => {
  it("fetches the module once, however often it is asked", async () => {
    let calls = 0;
    const C = preloadable(async () => {
      calls++;
      return { default: Page };
    });
    const a = C.preload();
    const b = C.preload();
    expect(a).toBe(b);
    expect((await a).default).toBe(Page);
    await C.preload();
    expect(calls).toBe(1);
  });

  it("tries again after a failed load rather than keeping the failure", async () => {
    let calls = 0;
    const C = preloadable(async () => {
      calls++;
      if (calls === 1) throw new Error("network blip");
      return { default: Page };
    });
    await expect(C.preload()).rejects.toThrow("network blip");
    expect((await C.preload()).default).toBe(Page);
    expect(calls).toBe(2);
  });

  it("does not start loading until something asks", () => {
    let calls = 0;
    preloadable(async () => {
      calls++;
      return { default: Page };
    });
    expect(calls).toBe(0);
  });
});
