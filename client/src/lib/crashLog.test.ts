import { describe, it, expect } from "vitest";
import {
  addCrash,
  buildCrash,
  describeError,
  formatCrash,
  MAX_CRASHES,
  type CrashRecord,
} from "./crashLog";

const AT = new Date("2026-08-19T14:05:00.000Z");

function record(over: Partial<CrashRecord> = {}): CrashRecord {
  return {
    at: AT.toISOString(),
    message: "Cannot read properties of undefined (reading 'name')",
    stack: "TypeError: boom\n    at BidsPage (BidsPage.tsx:412:9)",
    componentStack: "\n    in BidsPage\n    in BidRenderShell",
    where: "#/bids/12",
    version: "v5.108",
    ...over,
  };
}

describe("describeError", () => {
  it("takes the message and stack off a real Error", () => {
    const error = new Error("boom");
    const { message, stack } = describeError(error);
    expect(message).toBe("boom");
    expect(stack).toContain("boom");
  });

  it("falls back to the name when an Error has no message", () => {
    expect(describeError(new TypeError()).message).toBe("TypeError");
  });

  /**
   * `throw "nope"` is legal and does reach a boundary. The log must survive it,
   * because a crash logger that crashes leaves the user with a blank page.
   */
  it("handles a thrown string", () => {
    expect(describeError("nope")).toEqual({ message: "nope", stack: "" });
  });

  it("handles a thrown object", () => {
    expect(describeError({ code: 42 }).message).toBe('{"code":42}');
  });

  it("handles a circular object without throwing", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeError(circular)).not.toThrow();
    expect(describeError(circular).message).toBeTypeOf("string");
  });
});

describe("addCrash", () => {
  it("puts the newest first", () => {
    const older = record({ message: "older" });
    const newer = record({ message: "newer" });
    expect(addCrash([older], newer).map(c => c.message)).toEqual([
      "newer",
      "older",
    ]);
  });

  /**
   * The cap is not tidiness. A crash inside a render loop calls this on every
   * retry, and an uncapped list fills the origin's storage quota — which throws
   * a second error from inside the handler for the first.
   */
  it("never grows past the cap", () => {
    let log: CrashRecord[] = [];
    for (let i = 0; i < MAX_CRASHES + 5; i++) {
      log = addCrash(log, record({ message: `crash ${i}` }));
    }
    expect(log).toHaveLength(MAX_CRASHES);
    expect(log[0].message).toBe(`crash ${MAX_CRASHES + 4}`);
  });
});

describe("formatCrash", () => {
  it("leads with the facts a person asks for first", () => {
    const text = formatCrash(record());
    expect(text).toContain("When:    2026-08-19T14:05:00.000Z");
    expect(text).toContain("Screen:  #/bids/12");
    expect(text).toContain("Version: v5.108");
    expect(text).toContain(
      "Error:   Cannot read properties of undefined (reading 'name')"
    );
  });

  it("includes both stacks when there are both", () => {
    const text = formatCrash(record());
    expect(text).toContain("BidsPage.tsx:412:9");
    expect(text).toContain("Component stack:");
  });

  it("leaves an empty section out rather than printing a bare heading", () => {
    const text = formatCrash(record({ stack: "", componentStack: "" }));
    expect(text).not.toContain("Component stack:");
    expect(text.trimEnd().endsWith("(reading 'name')")).toBe(true);
  });
});

describe("buildCrash", () => {
  it("stamps the clock it is given rather than reading one", () => {
    const crash = buildCrash(new Error("boom"), "\n    in BidsPage", "#/x", AT);
    expect(crash.at).toBe(AT.toISOString());
    expect(crash.message).toBe("boom");
    expect(crash.where).toBe("#/x");
    expect(crash.componentStack).toBe("\n    in BidsPage");
    // Whatever the app is actually on — asserting a literal would make this a
    // test of the version file.
    expect(crash.version).toBeTypeOf("string");
    expect(crash.version.length).toBeGreaterThan(0);
  });
});
