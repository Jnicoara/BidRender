/**
 * The AI tie-break's two promises, both pure: the request is small and
 * bounded, and nothing outside a crop's own tied set is ever accepted as an
 * answer (`server/tieBreak.ts`).
 */
import { describe, it, expect } from "vitest";
import { parseTieBreak, tieBreakRequest, type TieCrop } from "./tieBreak";

const PIC = "data:image/png;base64,AAAA";

const said = (content: string) =>
  ({
    id: "x",
    created: 0,
    model: "m",
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content },
        finish_reason: "stop",
      },
    ],
  }) as never;

const crops: TieCrop[] = [
  { id: 1, picture: PIC, itemIds: [10, 11] },
  { id: 2, picture: PIC, itemIds: [10, 11] },
  { id: 3, picture: PIC, itemIds: [11, 12] },
];

describe("tie-break reply", () => {
  it("takes a pick only from that crop's own tied items", () => {
    const picks = parseTieBreak(
      said("Picture 1: 10\nPicture 2: 12\nPicture 3: 12"),
      crops
    );
    expect(picks.get(1)).toBe(10);
    // 12 is a real item, but not one picture 2 was tied between.
    expect(picks.get(2)).toBeNull();
    expect(picks.get(3)).toBe(12);
  });

  it("treats 0, a missing line and an invented id as no answer", () => {
    const picks = parseTieBreak(said("Picture 1: 0\nPicture 3: 99"), crops);
    expect(picks.get(1)).toBeNull();
    expect(picks.get(2)).toBeNull();
    expect(picks.get(3)).toBeNull();
  });

  it("does not read picture 1's answer out of picture 11's line", () => {
    const many: TieCrop[] = [
      { id: 1, picture: PIC, itemIds: [10, 11] },
      { id: 11, picture: PIC, itemIds: [10, 11] },
    ];
    const picks = parseTieBreak(said("Picture 11: 10"), many);
    expect(picks.get(11)).toBe(10);
    expect(picks.get(1)).toBeNull();
  });
});

describe("tie-break request", () => {
  it("is bounded, thinking off, and names each crop's choices", () => {
    const req = tieBreakRequest({
      model: "claude-sonnet-5",
      items: [
        { id: 10, label: "DUPLEX", picture: PIC },
        { id: 11, label: "DUPLEX 48\"", picture: PIC },
      ],
      crops: crops.slice(0, 2),
    });
    expect(req.maxTokens).toBeGreaterThan(0);
    expect(req.maxTokens).toBeLessThanOrEqual(400);
    expect(req.thinking).toEqual({ type: "disabled" });
    const text = JSON.stringify(req.messages);
    expect(text).toContain("Picture 2 — one of items 10, 11");
    // Two legend pictures plus two crops, nothing else.
    expect(text.match(/"type":"image_url"/g)?.length).toBe(4);
  });
});
