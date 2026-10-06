import { describe, expect, it } from "vitest";
import { startPageTextRead, type PageTextReads } from "./pageTextRead";

/** An extraction we finish by hand, to put the race exactly where it was. */
function deferred() {
  let resolve!: (text: string) => void;
  const promise = new Promise<string>(r => (resolve = r));
  return { promise, resolve };
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe("pulling a page's text for scale detection", () => {
  it("delivers the text when the effect re-runs mid-pull — the sheet rows arriving", async () => {
    // What the Plans screen does: start a pull; the sheet list arrives, so
    // the effect is cleaned up (cancel) and runs again. The old code marked
    // the page read on START, so the second run stopped and the first run's
    // text was thrown away: no scale detected, ever (2026-10-06).
    const reads: PageTextReads = { delivered: new Set() };
    const got: string[] = [];
    const first = deferred();
    const second = deferred();

    const cancelFirst = startPageTextRead(
      reads,
      1,
      () => first.promise,
      (_, t) => got.push(`old handler: ${t}`)
    );
    cancelFirst();
    startPageTextRead(
      reads,
      1,
      () => second.promise,
      (_, t) => got.push(`new handler: ${t}`)
    );

    first.resolve('SCALE: 1/4" = 1\'-0"');
    second.resolve('SCALE: 1/4" = 1\'-0"');
    await flush();

    expect(got).toEqual(['new handler: SCALE: 1/4" = 1\'-0"']);
  });

  it("asks again after a cancelled pull — flipping away and back", async () => {
    const reads: PageTextReads = { delivered: new Set() };
    const got: number[] = [];
    const pull = deferred();
    startPageTextRead(
      reads,
      2,
      () => pull.promise,
      p => got.push(p)
    )();
    pull.resolve("text");
    await flush();
    expect(got).toEqual([]);
    expect(reads.delivered.has(2)).toBe(false);

    startPageTextRead(
      reads,
      2,
      async () => "text",
      p => got.push(p)
    );
    await flush();
    expect(got).toEqual([2]);
  });

  it("delivers once when two pulls are in flight, and never re-pulls a delivered page", async () => {
    const reads: PageTextReads = { delivered: new Set() };
    let pulls = 0;
    const got: number[] = [];
    const extract = async () => {
      pulls++;
      return "text";
    };
    startPageTextRead(reads, 3, extract, p => got.push(p));
    startPageTextRead(reads, 3, extract, p => got.push(p));
    await flush();
    expect(got).toEqual([3]);

    startPageTextRead(reads, 3, extract, p => got.push(p));
    await flush();
    expect(pulls).toBe(2);
    expect(got).toEqual([3]);
  });

  it("swallows a page whose text will not extract", async () => {
    const reads: PageTextReads = { delivered: new Set() };
    const got: number[] = [];
    startPageTextRead(
      reads,
      4,
      () => Promise.reject(new Error("no text")),
      p => got.push(p)
    );
    await flush();
    expect(got).toEqual([]);
    expect(reads.delivered.has(4)).toBe(false);
  });
});
