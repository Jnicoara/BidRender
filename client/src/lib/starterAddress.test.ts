import { describe, expect, it } from "vitest";
import {
  isStarterAddress,
  starterSessionNote,
  starterTabFromHash,
} from "./starterAddress";

describe("the starter editor's address", () => {
  it("is /starter and below, any case, trailing slash or not", () => {
    expect(isStarterAddress("/starter")).toBe(true);
    expect(isStarterAddress("/starter/")).toBe(true);
    expect(isStarterAddress("/Starter")).toBe(true);
    expect(isStarterAddress("/starter/anything")).toBe(true);
  });

  it("is never the company app, nor a look-alike", () => {
    // The company app lives under "/" with hash routes.
    expect(isStarterAddress("/")).toBe(false);
    expect(isStarterAddress("/settings")).toBe(false);
    expect(isStarterAddress("/starters")).toBe(false);
    expect(isStarterAddress("/starter-assemblies")).toBe(false);
  });
});

describe("the session line", () => {
  const time = (ms: number) => `t${ms}`;
  it("names the time the server said, not a countdown", () => {
    expect(starterSessionNote(5000, 1000, time)).toBe(
      "Signs out at t5000 if idle"
    );
  });
  it("says ended once that time has passed", () => {
    expect(starterSessionNote(1000, 1000, time)).toBe("Session ended");
  });
});

describe("the tab in the address", () => {
  it("reads a known tab, and falls back to the first", () => {
    expect(starterTabFromHash("#assemblies")).toBe("assemblies");
    expect(starterTabFromHash("#/run-types")).toBe("run-types");
    expect(starterTabFromHash("")).toBe("materials");
    expect(starterTabFromHash("#bids")).toBe("materials");
  });
});
