/**
 * The browser's memory of which added looks were confirmed once
 * (@/lib/trustedLooks). The one property that matters: every failure leaves a
 * look UNtrusted, never trusted.
 */
import { describe, expect, it } from "vitest";
import { readTrustedLooks, rememberTrustedLooks } from "./trustedLooks";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe("remembering confirmed looks", () => {
  it("remembers across reads, without duplicates", () => {
    const s = memory();
    rememberTrustedLooks(s, [4, 9]);
    rememberTrustedLooks(s, [9]);
    expect(Array.from(readTrustedLooks(s)).sort()).toEqual([4, 9]);
  });

  it("trusts nothing when storage is missing, throws or holds junk", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTrustedLooks(null).size).toBe(0);
    expect(readTrustedLooks(throwing).size).toBe(0);
    expect(() => rememberTrustedLooks(throwing, [1])).not.toThrow();
    const junk = memory();
    junk.setItem("bidridge:trusted-looks", '{"1":true}');
    expect(readTrustedLooks(junk).size).toBe(0);
    junk.setItem("bidridge:trusted-looks", '[1, "2", -3, 1.5]');
    expect(Array.from(readTrustedLooks(junk))).toEqual([1]);
  });
});
