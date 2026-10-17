import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

  it("prefetch goes through the loader's QUIET path, never the reloading one (2026-10-16)", async () => {
    // A background fetch that failed offline armed a tab reload for a page
    // nobody opened (@/lib/lazyPage). prefetch must not touch that path.
    let loud = 0;
    let quiet = 0;
    const load = Object.assign(
      async () => {
        loud++;
        return { default: Page };
      },
      {
        quiet: async () => {
          quiet++;
          throw new Error("offline");
        },
      }
    );
    const C = preloadable(load);
    await expect(C.prefetch()).resolves.toBeUndefined();
    expect(quiet).toBe(1);
    expect(loud).toBe(0);
    // The failure is forgotten: opening the page asks again, loudly.
    expect((await C.preload()).default).toBe(Page);
    expect(loud).toBe(1);
  });

  it("the shell's background fetch uses prefetch for every page", () => {
    const shell = readFileSync(
      new URL("../pages/BidRenderShell.tsx", import.meta.url),
      "utf8"
    );
    const list = shell.slice(
      shell.indexOf("const PAGE_LOADERS = ["),
      shell.indexOf("];", shell.indexOf("const PAGE_LOADERS = ["))
    );
    expect(list).toMatch(/\.prefetch,/);
    expect(list).not.toMatch(/\.preload\b/);
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
