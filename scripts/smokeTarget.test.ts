import { describe, expect, it } from "vitest";
import { checkSmokeTarget, STAGING_ORIGIN } from "./smokeTarget";

describe("where the browser smoke test may point", () => {
  it("allows staging", () => {
    expect(checkSmokeTarget("https://staging.bidridge.com")).toEqual({
      ok: true,
      origin: STAGING_ORIGIN,
      kind: "staging",
    });
    expect(checkSmokeTarget("https://staging.bidridge.com/").ok).toBe(true);
  });

  it("allows a server on this machine", () => {
    expect(checkSmokeTarget("http://127.0.0.1:3018")).toMatchObject({
      ok: true,
      kind: "local",
    });
    expect(checkSmokeTarget("http://localhost:3000").ok).toBe(true);
  });

  it("refuses the live site by name, with and without www", () => {
    for (const live of [
      "https://bidridge.com",
      "https://www.bidridge.com",
      "https://BIDRIDGE.com/#/dashboard",
      "http://bidridge.com",
    ]) {
      const result = checkSmokeTarget(live);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/LIVE site/);
    }
  });

  it("refuses anything not on the allow list", () => {
    for (const other of [
      "https://bidrender.com",
      "https://staging.bidridge.com.evil.example",
      "http://staging.bidridge.com", // staging only over https
      "https://example.com",
      "https://127.0.0.1:3018", // local only over http
    ]) {
      expect(checkSmokeTarget(other).ok).toBe(false);
    }
  });

  it("refuses an empty or malformed address", () => {
    expect(checkSmokeTarget(undefined).ok).toBe(false);
    expect(checkSmokeTarget("  ").ok).toBe(false);
    expect(checkSmokeTarget("not a url").ok).toBe(false);
  });
});
