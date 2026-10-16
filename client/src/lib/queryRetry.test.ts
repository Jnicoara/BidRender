import { describe, expect, it } from "vitest";
import { shouldRetryRead } from "./queryRetry";

const trpcError = (code: string) => ({ message: "x", data: { code } });

describe("shouldRetryRead", () => {
  it("does not ask again for an answer the server already gave", () => {
    for (const code of [
      "NOT_FOUND",
      "FORBIDDEN",
      "UNAUTHORIZED",
      "BAD_REQUEST",
    ])
      expect(shouldRetryRead(0, trpcError(code)), code).toBe(false);
  });

  it("retries a dropped connection or a server fault, three times", () => {
    const network = new TypeError("Failed to fetch");
    expect(shouldRetryRead(0, network)).toBe(true);
    expect(shouldRetryRead(2, network)).toBe(true);
    expect(shouldRetryRead(3, network)).toBe(false);
    expect(shouldRetryRead(0, trpcError("INTERNAL_SERVER_ERROR"))).toBe(true);
    expect(shouldRetryRead(0, trpcError("SERVICE_UNAVAILABLE"))).toBe(true);
  });
});
