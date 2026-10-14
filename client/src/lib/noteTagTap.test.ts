import { describe, expect, it } from "vitest";
import { readKeyedNotes, type NoteList, type NoteWord } from "./keyedNotes";
import {
  TAG_TAP_MIN_SCREEN_PX,
  nearestTag,
  noteForTag,
  noteTapsLive,
  noteTapsOn,
  placeNoteCard,
  tagTapRadius,
} from "./noteTagTap";
import weld1E200 from "./__fixtures__/weld1-e200-notes.json";

/* The real sheet (scripts/keyedNotesFixture.mts), not typed from memory. */
const e200 = readKeyedNotes(weld1E200.words as NoteWord[], {
  segs: Float32Array.from(weld1E200.segs),
  lightness: Uint8Array.from(weld1E200.lightness),
});

describe("tagTapRadius — a finger finds the tag at any zoom", () => {
  // E-200's tags measured a 13.5 pt square: r ≈ 6.75.
  const tag = { r: 6.75 };
  const renderScale = 1.5;

  it("is never under 32 screen px across, even at 19% zoom", () => {
    for (const zoom of [0.19, 0.5, 1, 2.12, 4]) {
      const screenAcross = 2 * tagTapRadius(tag, renderScale, zoom) * zoom;
      expect(screenAcross).toBeGreaterThanOrEqual(TAG_TAP_MIN_SCREEN_PX - 1e-9);
    }
  });

  it("at 19% the floor is what decides — the tag alone is about 4 px", () => {
    const zoom = 0.19;
    expect(2 * (tag.r + 2.5) * renderScale * zoom).toBeLessThan(6);
    expect(2 * tagTapRadius(tag, renderScale, zoom) * zoom).toBeCloseTo(32);
  });

  it("zoomed in, the target is the tag's own ring, not a 32 px blob", () => {
    const zoom = 4;
    expect(tagTapRadius(tag, renderScale, zoom)).toBeCloseTo(
      (6.75 + 2.5) * renderScale
    );
  });
});

describe("nearestTag — overlapping targets go to the nearer tag", () => {
  it("at 19% two tags 100 pt apart overlap, and each still gets its own tap", () => {
    const tags = [
      { x: 1000, y: 500 },
      { x: 1100, y: 500 },
    ];
    // Both targets are 32 px across at 19%: radius 16 / 0.19 / 1.5 ≈ 56 pt
    // each, so a tap at x = 1060 is inside BOTH. The second is nearer.
    const r = tagTapRadius({ r: 6.75 }, 1.5, 0.19) / 1.5;
    expect(r).toBeGreaterThan(50);
    expect(nearestTag(tags, { x: 1060, y: 500 })).toBe(1);
    expect(nearestTag(tags, { x: 1040, y: 500 })).toBe(0);
  });
  it("on E-200, a tap on each tag's centre opens that tag", () => {
    e200.tags.forEach((t, i) => {
      const hit = nearestTag(e200.tags, { x: t.x, y: t.y });
      expect(e200.tags[hit].label).toBe(t.label);
      expect(
        hit === i || (e200.tags[hit].x === t.x && e200.tags[hit].y === t.y)
      ).toBe(true);
    });
  });
  it("no tags: nothing", () => {
    expect(nearestTag([], { x: 0, y: 0 })).toBe(-1);
  });
});

describe("noteForTag — which note a tag opens (E-200)", () => {
  it("every tag on the sheet opens a note, with its text", () => {
    expect(e200.tags.length).toBeGreaterThan(0);
    for (const t of e200.tags) {
      const found = noteForTag(e200, t.label);
      expect(found?.note.label).toBe(t.label);
      expect(found?.note.text.length).toBeGreaterThan(0);
      expect(found?.list.heading).toBe("WORK NOTES");
    }
  });

  it("tag 1 opens WORK NOTE 1 as printed", () => {
    expect(noteForTag(e200, "1")?.note.text).toBe(
      "PROVIDE 240V. 30/2 N.F. HEAVY DUTY DISCONNECT FOR BODY SCANNER CONNECTION. COORDINATE WITH EQUIPMENT SUPPLIER."
    );
  });

  it("a number with no note opens nothing", () => {
    expect(noteForTag(e200, "19")).toBeNull();
  });

  it("never opens a GENERAL note, even when it comes first", () => {
    const box = { x0: 0, y0: 0, x1: 1, y1: 1 };
    const lists: NoteList[] = [
      {
        heading: "GENERAL NOTES",
        keyed: false,
        notes: [{ label: "3", text: "general three", at: { x: 0, y: 0 } }],
        box,
      },
      {
        heading: "KEYED NOTES",
        keyed: true,
        notes: [{ label: "3", text: "keyed three", at: { x: 5, y: 5 } }],
        box,
      },
    ];
    expect(noteForTag({ lists }, "3")?.note.text).toBe("keyed three");
    expect(noteForTag({ lists: [lists[0]] }, "3")).toBeNull();
  });
});

describe("the switch — taps are on unless turned off", () => {
  it("is on with nothing stored", () => {
    expect(noteTapsOn(null)).toBe(true);
    expect(noteTapsOn(undefined)).toBe(true);
  });
  it("is off only when somebody turned it off", () => {
    expect(noteTapsOn("off")).toBe(false);
    expect(noteTapsOn("on")).toBe(true);
  });
});

describe("noteTapsLive — counting and tracing never change", () => {
  const ready = { tapsOn: true, toolInHand: false, read: e200 };
  it("is live with no tool in hand on a sheet with tags", () => {
    expect(noteTapsLive(ready)).toBe(true);
  });
  it("is dead while any tool is in hand", () => {
    expect(noteTapsLive({ ...ready, toolInHand: true })).toBe(false);
  });
  it("is dead when turned off, while reading, or with no tags", () => {
    expect(noteTapsLive({ ...ready, tapsOn: false })).toBe(false);
    expect(noteTapsLive({ ...ready, read: null })).toBe(false);
    expect(noteTapsLive({ ...ready, read: { tags: [] } })).toBe(false);
  });
});

describe("placeNoteCard — never on the tag, never off the drawing", () => {
  // A laptop: toolbar above, side panel at the right; the drawing between.
  const win = { width: 1536, height: 864 };
  const drawing = { left: 0, top: 100, width: 1150, height: 764 };
  const card = { width: 320, height: 160 };
  const inside = (s: { left: number; top: number }) =>
    s.left >= drawing.left &&
    s.top >= drawing.top &&
    s.left + card.width <= drawing.left + drawing.width &&
    s.top + card.height <= drawing.top + drawing.height;
  const covers = (s: { left: number; top: number }, t: typeof tag) =>
    s.left < t.left + t.width &&
    s.left + card.width > t.left &&
    s.top < t.top + t.height &&
    s.top + card.height > t.top;
  const tag = { left: 500, top: 400, width: 32, height: 32 };

  it("goes just below the tag when there is room", () => {
    const s = placeNoteCard(tag, card, win, drawing);
    expect(s.top).toBe(tag.top + tag.height + 8);
    expect(inside(s)).toBe(true);
  });

  it("near the panel's edge it stays in the drawing, not over the panel", () => {
    const t = { left: 1120, top: 400, width: 32, height: 32 };
    const s = placeNoteCard(t, card, win, drawing);
    expect(s.left + card.width).toBeLessThanOrEqual(1150);
    expect(covers(s, t)).toBe(false);
  });

  it("near the toolbar it never goes up into it", () => {
    const t = { left: 300, top: 104, width: 32, height: 32 };
    const s = placeNoteCard(t, card, win, drawing);
    expect(s.top).toBeGreaterThanOrEqual(100);
    expect(covers(s, t)).toBe(false);
  });

  it("at the bottom corner it still uncovers the tag", () => {
    const t = { left: 1110, top: 830, width: 32, height: 32 };
    const s = placeNoteCard(t, card, win, drawing);
    expect(inside(s)).toBe(true);
    expect(covers(s, t)).toBe(false);
  });

  it("everywhere on the drawing: inside it and off the tag", () => {
    for (let x = 0; x <= 1118; x += 43)
      for (let y = 100; y <= 832; y += 37) {
        const t = { left: x, top: y, width: 32, height: 32 };
        const s = placeNoteCard(t, card, win, drawing);
        expect(inside(s)).toBe(true);
        expect(covers(s, t)).toBe(false);
      }
  });
});
