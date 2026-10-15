import { TRPCClientError } from "@trpc/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  dataIsUnreachable,
  isReachFailure,
  noteNoAnswer,
  noteReadFailure,
  noteReadSuccess,
  subscribeDataReach,
} from "./dataReach";

function trpcError(code: string | null, message = "x", cause?: Error) {
  const e = new TRPCClientError(message, { cause });
  if (code) Object.assign(e, { data: { code } });
  return e;
}

afterEach(() => noteReadSuccess());

describe("isReachFailure", () => {
  it("is the server saying it cannot reach its data", () => {
    expect(isReachFailure(trpcError("SERVICE_UNAVAILABLE"))).toBe(true);
  });

  it("is a request that got no answer at all", () => {
    expect(
      isReachFailure(trpcError(null, "Failed to fetch", new TypeError("x")))
    ).toBe(true);
    expect(isReachFailure(trpcError(null, "Failed to fetch"))).toBe(true);
  });

  it("is NOT an answer the server gave about the request", () => {
    for (const code of [
      "NOT_FOUND",
      "FORBIDDEN",
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "CONFLICT",
      "INTERNAL_SERVER_ERROR",
    ])
      expect(isReachFailure(trpcError(code)), code).toBe(false);
  });

  it("ignores anything that is not a tRPC error", () => {
    expect(isReachFailure(new TypeError("Failed to fetch"))).toBe(false);
    expect(isReachFailure(null)).toBe(false);
  });
});

describe("the app-wide flag", () => {
  it("rises on a reach failure, ignores other failures, falls on success", () => {
    let calls = 0;
    const stop = subscribeDataReach(() => calls++);
    noteReadFailure(trpcError("NOT_FOUND"));
    expect(dataIsUnreachable()).toBe(false);
    noteReadFailure(trpcError("SERVICE_UNAVAILABLE"));
    expect(dataIsUnreachable()).toBe(true);
    noteReadFailure(trpcError("SERVICE_UNAVAILABLE"));
    noteReadSuccess();
    expect(dataIsUnreachable()).toBe(false);
    expect(calls).toBe(2); // up once, down once — repeats are not news
    stop();
  });

  it("rises when a read got no answer at all, and falls on the next one", () => {
    noteNoAnswer();
    expect(dataIsUnreachable()).toBe(true);
    noteReadSuccess();
    expect(dataIsUnreachable()).toBe(false);
  });
});
