import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUERY_DEADLINE_MS, withQueryDeadline } from "./queryDeadline";

/**
 * A fetch that never answers until told to — the staging stall of smoke flow
 * 9, where one batched read held the whole Plans screen blank for 60 s.
 */
function hangingFetch() {
  const calls: { init?: RequestInit; answer: () => void }[] = [];
  const impl = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const call = {
        init,
        answer: () => resolve(new Response("{}")),
      };
      calls.push(call);
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal!.reason)
      );
    })) as typeof fetch;
  return { impl, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a read that does not answer", () => {
  it("is given up on at the deadline, so it fails and can be asked again", async () => {
    const { impl } = hangingFetch();
    const read = withQueryDeadline(impl)("/api/trpc/bidPdfs.list");
    const outcome = read.then(
      () => "answered",
      (e: Error) => e.message
    );
    await vi.advanceTimersByTimeAsync(QUERY_DEADLINE_MS - 1);
    expect(
      await Promise.race([outcome, Promise.resolve("still waiting")])
    ).toBe("still waiting");
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toMatch(/No answer from the server/);
  });

  it("is not cut once it has answered", async () => {
    const { impl, calls } = hangingFetch();
    const read = withQueryDeadline(impl)("/api/trpc/bids.get", {
      method: "GET",
    });
    calls[0].answer();
    await expect(read).resolves.toBeInstanceOf(Response);
    // The timer is gone: nothing aborts the body afterwards.
    await vi.advanceTimersByTimeAsync(QUERY_DEADLINE_MS * 2);
    expect(calls[0].init?.signal?.aborted).toBe(false);
  });

  it("still cancels when the caller cancels", async () => {
    const { impl, calls } = hangingFetch();
    const caller = new AbortController();
    const read = withQueryDeadline(impl)("/api/trpc/bids.get", {
      signal: caller.signal,
    });
    caller.abort(new Error("unmounted"));
    await expect(read).rejects.toThrow("unmounted");
    expect(calls[0].init?.signal?.aborted).toBe(true);
  });
});

describe("a write", () => {
  it("is never given up on — it may already have happened on the server", async () => {
    // Sending a mark batch again after a timeout could place it twice.
    const { impl, calls } = hangingFetch();
    const write = withQueryDeadline(impl)("/api/trpc/takeoffStamps.drop", {
      method: "POST",
    });
    await vi.advanceTimersByTimeAsync(QUERY_DEADLINE_MS * 5);
    expect(calls[0].init?.signal).toBeUndefined();
    calls[0].answer();
    await expect(write).resolves.toBeInstanceOf(Response);
  });
});
