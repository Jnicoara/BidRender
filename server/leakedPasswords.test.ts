/**
 * server/leakedPasswords.ts — no network: every case hands in its own fetch.
 * SHA-1("password") = 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8.
 */
import { describe, expect, it } from "vitest";
import { isLeakedPassword } from "./leakedPasswords";

const ON = { LEAKED_PASSWORD_CHECK: "on" };
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function replying(body: string, status = 200) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    return { ok: status < 400, status, text: async () => body };
  };
  return { calls, fetchImpl };
}

describe("isLeakedPassword", () => {
  it("sends only the first five characters of the hash", async () => {
    const { calls, fetchImpl } = replying("");
    await isLeakedPassword("password", { fetchImpl, env: ON });
    expect(calls).toEqual(["https://api.pwnedpasswords.com/range/5BAA6"]);
    expect(calls[0]).not.toContain(SUFFIX);
  });

  it("finds the suffix in the reply, any case, with a real count", async () => {
    const { fetchImpl } = replying(
      `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX.toLowerCase()}:10434004\r\n`
    );
    expect(await isLeakedPassword("password", { fetchImpl, env: ON })).toBe(
      true
    );
  });

  it("does not count a padding row (count 0) as a leak", async () => {
    const { fetchImpl } = replying(`${SUFFIX}:0\r\n`);
    expect(await isLeakedPassword("password", { fetchImpl, env: ON })).toBe(
      false
    );
  });

  it("says false when the suffix is not there", async () => {
    const { fetchImpl } = replying("0018A45C4D1DEF81644B54AB7F969B88D65:3");
    expect(await isLeakedPassword("password", { fetchImpl, env: ON })).toBe(
      false
    );
  });

  it("fails OPEN — null, allowed — when the service errors, is down or is slow", async () => {
    expect(
      await isLeakedPassword("password", {
        fetchImpl: replying("", 503).fetchImpl,
        env: ON,
      })
    ).toBeNull();
    expect(
      await isLeakedPassword("password", {
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
        env: ON,
      })
    ).toBeNull();
    const slow = (_url: string, init: { signal: AbortSignal }) =>
      new Promise<never>((_, reject) =>
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        )
      );
    expect(
      await isLeakedPassword("password", {
        fetchImpl: slow,
        timeoutMs: 20,
        env: ON,
      })
    ).toBeNull();
  });

  it("asks nobody when switched off — how every other test runs", async () => {
    const { calls, fetchImpl } = replying(`${SUFFIX}:5`);
    expect(
      await isLeakedPassword("password", {
        fetchImpl,
        env: { LEAKED_PASSWORD_CHECK: "off" },
      })
    ).toBeNull();
    expect(calls).toEqual([]);
  });
});
