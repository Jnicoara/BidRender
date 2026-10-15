import { describe, expect, it } from "vitest";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "@/lib/trpc";
import { isStepBarQuery } from "./stepBarQuery";

describe("isStepBarQuery", () => {
  // Against the key tRPC itself builds, not a hand-written copy of it: a
  // hand-written key would only prove this function agrees with itself.
  it("matches the key tRPC builds for bids.progress", () => {
    const key = getQueryKey(trpc.bids.progress, { bidId: 7 }, "query");
    expect(isStepBarQuery(key)).toBe(true);
  });

  it("leaves every other query alone", () => {
    expect(isStepBarQuery(getQueryKey(trpc.bids.get, { id: 7 }, "query"))).toBe(
      false
    );
    expect(isStepBarQuery(getQueryKey(trpc.bids.dashboard))).toBe(false);
    expect(isStepBarQuery(["bids"])).toBe(false);
  });
});
