import { describe, expect, it } from "vitest";
import type { Match } from "./findMatching";
import {
  AI_BATCH,
  AI_REASONS,
  aiBatch,
  applyAiAnswers,
  clearOpen,
  decide,
  itemKind,
  matchItems,
  nextToLookAt,
  summary,
  type MatchItem,
  type ScanFindAnswer,
} from "./findMatchingSession";

const m = (x: number, over: Partial<Match> = {}): Match => ({
  x,
  y: 100,
  halfWidth: 5,
  halfHeight: 5,
  rotation: 0,
  mirrored: false,
  coverage: 1,
  needsLook: [],
  maybeExisting: [],
  isBoxed: false,
  onDemolitionPlan: null,
  ...over,
});

const items = () =>
  matchItems(
    [
      m(100),
      m(200, { needsLook: ['"GF" is written beside it'] }),
      m(300, { maybeExisting: ['"(E)" is written beside it'] }),
      m(400),
      m(500),
    ],
    // Already counted at 400 (any count), and a mark too far from 500.
    [
      { x: 401, y: 102, name: "Duplex" },
      { x: 520, y: 100, name: "Duplex" },
    ]
  );

describe("a Find all matching session", () => {
  it("starts every copy unconfirmed, and offers an already-marked one as already counted", () => {
    const list = items();
    expect(list.every(i => i.state === "open")).toBe(true);
    expect(list.map(itemKind)).toEqual([
      "clear",
      "needsLook",
      "maybeExisting",
      "already",
      "clear",
    ]);
  });

  it("confirms only the clear ones on Confirm all — never a flagged or counted one", () => {
    expect(clearOpen(items()).map(i => i.x)).toEqual([100, 500]);
  });

  it("counts what is left to decide as decisions are made", () => {
    let list = items();
    list = decide(
      list,
      clearOpen(list).map(i => i.id),
      "confirmed"
    );
    list = decide(list, [2], "confirmedExisting");
    list = decide(list, [1], "rejected");
    expect(summary(list)).toEqual({
      found: 5,
      clear: 0,
      needsLook: 0,
      maybeExisting: 0,
      already: 1,
      demolition: 0,
      confirmed: 3,
      rejected: 1,
    });
    expect(nextToLookAt(list, null)).toBeNull();
  });

  it("walks the flagged ones first, then the clear ones, and wraps", () => {
    const list = items();
    const order: number[] = [];
    let at: number | null = null;
    for (let k = 0; k < 5; k++) {
      const next = nextToLookAt(list, at);
      if (!next) break;
      order.push(next.x);
      at = next.id;
    }
    expect(order).toEqual([200, 300, 100, 500, 200]);
  });
});

describe("scan finds and the AI button", () => {
  const scanItems = () =>
    matchItems(
      [
        m(100),
        m(200),
        m(300, { needsLook: ["coarse"] }),
        m(400, { onDemolitionPlan: "DEMOLITION PLAN" }),
      ],
      []
    );

  it("a demolition copy is visited last by Next and never confirmed by Confirm all", () => {
    const list = scanItems();
    expect(clearOpen(list).map(i => i.x)).toEqual([100, 200]);
    const order: number[] = [];
    let at: number | null = null;
    for (let k = 0; k < 4; k++) {
      const next: MatchItem = nextToLookAt(list, at)!;
      order.push(next.x);
      at = next.id;
    }
    expect(order).toEqual([300, 100, 200, 400]);
  });

  it("sends flagged ones first, at most one batch, and never the same copy twice", () => {
    const many = matchItems(
      Array.from({ length: 20 }, (_, k) =>
        m(k * 10, k === 19 ? { needsLook: ["coarse"] } : {})
      ),
      []
    );
    const first = aiBatch(many);
    expect(first).toHaveLength(AI_BATCH);
    expect(first[0].x).toBe(190);
    const answered = applyAiAnswers(
      many,
      new Map(first.map(i => [i.id, "same" as const]))
    );
    const second = aiBatch(answered);
    expect(second).toHaveLength(20 - AI_BATCH);
    expect(second.some(i => first.some(f => f.id === i.id))).toBe(false);
  });

  it("an answer that disagrees becomes a reason; nothing is confirmed by it", () => {
    const list = applyAiAnswers(
      scanItems(),
      new Map<number, ScanFindAnswer | null>([
        [0, "otherLabel"],
        [1, "existing"],
        [2, null],
      ])
    );
    expect(itemKind(list[0])).toBe("needsLook");
    expect(list[0].needsLook).toEqual([AI_REASONS.otherLabel]);
    expect(itemKind(list[1])).toBe("maybeExisting");
    expect(list[2].ai).toBe("noAnswer");
    expect(list.every(i => i.state === "open")).toBe(true);
    // Neither is clear any more, so Confirm all takes neither.
    expect(clearOpen(list)).toEqual([]);
  });
});
