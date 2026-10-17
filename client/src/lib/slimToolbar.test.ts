import { describe, expect, it } from "vitest";
import {
  SLIM_TOOLBAR_KEY,
  readSlimToolbar,
  writeSlimToolbar,
} from "./slimToolbar";

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe("slim toolbar", () => {
  it("is off until chosen, remembered, and cleared when turned off", () => {
    const s = memory();
    expect(readSlimToolbar(s)).toBe(false);
    writeSlimToolbar(s, true);
    expect(s.m.get(SLIM_TOOLBAR_KEY)).toBe("1");
    expect(readSlimToolbar(s)).toBe(true);
    writeSlimToolbar(s, false);
    expect(s.m.has(SLIM_TOOLBAR_KEY)).toBe(false);
  });

  it("survives storage that refuses (private browsing) as plain off", () => {
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(readSlimToolbar(refusing)).toBe(false);
    expect(() => writeSlimToolbar(refusing, true)).not.toThrow();
    expect(readSlimToolbar(undefined)).toBe(false);
  });
});
