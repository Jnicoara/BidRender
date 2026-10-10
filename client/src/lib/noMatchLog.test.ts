import { describe, it, expect } from "vitest";
import { createMissRecorder, missToRecord } from "./noMatchLog";

const none = new Set<string>();

describe("when a picker search is recorded as a miss", () => {
  it("records words that found nothing, normalised", () => {
    expect(
      missToRecord({
        query: " Sealtite 90 ",
        resultCount: 0,
        ready: true,
        alreadySent: none,
      })
    ).toBe("sealtite 90");
  });
  it("not while the list it searches is still loading", () => {
    expect(
      missToRecord({
        query: "romex",
        resultCount: 0,
        ready: false,
        alreadySent: none,
      })
    ).toBe(null);
  });
  it("not when something was found", () => {
    expect(
      missToRecord({
        query: "romex",
        resultCount: 3,
        ready: true,
        alreadySent: none,
      })
    ).toBe(null);
  });
  it("not for an empty box or one letter", () => {
    for (const query of ["", "  ", "x"])
      expect(
        missToRecord({ query, resultCount: 0, ready: true, alreadySent: none })
      ).toBe(null);
  });
  it("once per picker opening, however it was typed", () => {
    expect(
      missToRecord({
        query: "SEALTITE  90",
        resultCount: 0,
        ready: true,
        alreadySent: new Set(["sealtite 90"]),
      })
    ).toBe(null);
  });
});

describe("the recorder: settle time, and acting on a miss", () => {
  /** A hand-cranked clock: nothing fires until `tick` says so. */
  function harness() {
    const sent: string[] = [];
    let timers: { fire: () => void; at: number; live: boolean }[] = [];
    let clock = 0;
    const recorder = createMissRecorder(
      words => sent.push(words),
      {
        set: (fire, ms) => {
          const timer = { fire, at: clock + ms, live: true };
          timers.push(timer);
          return timer;
        },
        clear: handle => {
          (handle as { live: boolean }).live = false;
        },
      },
      2000
    );
    const tick = (ms: number) => {
      clock += ms;
      for (const timer of timers)
        if (timer.live && timer.at <= clock) {
          timer.live = false;
          timer.fire();
        }
      timers = timers.filter(t => t.live);
    };
    return { recorder, sent, tick };
  }
  const miss = (query: string) => ({ query, resultCount: 0, ready: true });

  it("records a miss once it has settled", () => {
    const { recorder, sent, tick } = harness();
    recorder.observe(miss("zz pole bracket"));
    tick(1999);
    expect(sent).toEqual([]);
    tick(1);
    expect(sent).toEqual(["zz pole bracket"]);
  });
  it("a fast type-and-Enter is recorded AT ONCE, not lost to the settle", () => {
    const { recorder, sent, tick } = harness();
    recorder.observe(miss("zz pole bracket"));
    tick(300);
    recorder.now();
    expect(sent).toEqual(["zz pole bracket"]);
    // ...and the timer it replaced does not record it a second time.
    tick(5000);
    expect(sent).toEqual(["zz pole bracket"]);
  });
  it("acting on a search that FOUND something records nothing", () => {
    const { recorder, sent, tick } = harness();
    recorder.observe({ query: "romex", resultCount: 4, ready: true });
    recorder.now();
    tick(5000);
    expect(sent).toEqual([]);
  });
  it("a prefix that found nothing for a moment is not recorded", () => {
    const { recorder, sent, tick } = harness();
    recorder.observe(miss("sealt"));
    tick(500);
    recorder.observe({ query: "sealtite", resultCount: 2, ready: true });
    tick(5000);
    expect(sent).toEqual([]);
  });
  it("closing the picker on half-typed words records nothing", () => {
    const { recorder, sent, tick } = harness();
    recorder.observe(miss("zz pole"));
    recorder.dispose();
    tick(5000);
    expect(sent).toEqual([]);
  });
  it("Enter twice on the same miss records it once", () => {
    const { recorder, sent } = harness();
    recorder.observe(miss("zz pole bracket"));
    recorder.now();
    recorder.now();
    recorder.observe(miss("ZZ  pole bracket"));
    recorder.now();
    expect(sent).toEqual(["zz pole bracket"]);
  });
});
