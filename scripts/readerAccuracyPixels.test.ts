import { describe, expect, it } from "vitest";
import {
  sheetReadingRequest,
  type SheetDetection,
} from "../server/planReading";
import { buildFindings } from "../shared/copilotDetection";
import {
  askForPixels,
  FRACTION_PROMPT_LINE,
  FRACTION_X,
  FRACTION_Y,
  pixelsToFractions,
} from "./readerAccuracyPixels";

// The REAL request, so a rewording in server/planReading.ts turns this red
// before anybody pays for a run that asked the old question.
const today = () =>
  sheetReadingRequest({
    model: "claude-sonnet-5",
    symbols: [{ label: "Duplex", assemblyName: null } as never],
    sheetName: "E1.02",
    pageText: "",
    pageImage: "data:image/jpeg;base64,AAAA",
  });

const text = (value: unknown) => JSON.stringify(value);

describe("askForPixels", () => {
  it("finds today's position words in the real request", () => {
    const request = today();
    expect(text(request.messages[0].content)).toContain(
      text(FRACTION_PROMPT_LINE).slice(1, -1)
    );
    expect(text(request.tools)).toContain(FRACTION_X);
    expect(text(request.tools)).toContain(FRACTION_Y);
  });

  it("asks for pixels of the stated size, and no fractions remain", () => {
    const asked = askForPixels(today(), 1932, 1288);
    const prompt = String(asked.messages[0].content);
    expect(prompt).toContain(
      "in pixels of the image you are shown (1932 x 1288 pixels)"
    );
    expect(prompt).not.toContain(FRACTION_PROMPT_LINE);
    const tools = text(asked.tools);
    expect(tools).toContain("0 at the left edge to 1932 at the right");
    expect(tools).toContain("0 at the top edge to 1288 at the bottom");
    expect(tools).not.toContain(FRACTION_X);
    expect(tools).not.toContain(FRACTION_Y);
  });

  it("changes nothing else in the request", () => {
    const before = today();
    const after = askForPixels(before, 1932, 1288);
    expect(after.messages[1]).toEqual(before.messages[1]);
    expect(after.maxTokens).toBe(before.maxTokens);
    expect(after.thinking).toEqual(before.thinking);
    expect(after.model).toBe(before.model);
    // And today's request itself was not edited in place.
    expect(text(before.tools)).toContain(FRACTION_X);
  });

  it("refuses rather than sending today's request under a pixels label", () => {
    const reworded = today();
    reworded.messages[0] = {
      ...reworded.messages[0],
      content: "a prompt that no longer says how to give a position",
    };
    expect(() => askForPixels(reworded, 1932, 1288)).toThrow(
      /planReading\.ts has changed/
    );
  });

  it("refuses a picture with no size", () => {
    expect(() => askForPixels(today(), 0, 1288)).toThrow(/size/);
  });
});

describe("pixelsToFractions", () => {
  const detection = (x: unknown, y: unknown): SheetDetection => ({
    symbol: "Duplex",
    x,
    y,
    confidence: 0.9,
    legible: true,
    note: null,
  });

  it("lands a pixel answer on the same page point as the fraction answer", () => {
    // A 36x24 in sheet sent as 1932 x 1288 px. The centre, both ways.
    const context = {
      symbols: [],
      corrections: [],
      pageWidthPoints: 36 * 72,
      pageHeightPoints: 24 * 72,
    };
    const [fromPixels] = buildFindings(
      pixelsToFractions([detection(966, 644)], 1932, 1288),
      context
    );
    const [fromFraction] = buildFindings([detection(0.5, 0.5)], context);
    expect(fromPixels.x).toBeCloseTo(fromFraction.x!, 6);
    expect(fromPixels.y).toBeCloseTo(fromFraction.y!, 6);
  });

  it("leaves a pixel answer past the edge off the page, as buildFindings refuses it", () => {
    const [off] = buildFindings(
      pixelsToFractions([detection(2000, 100)], 1932, 1288),
      {
        symbols: [],
        corrections: [],
        pageWidthPoints: 2592,
        pageHeightPoints: 1728,
      }
    );
    expect(off.x).toBeNull();
  });

  it("passes a non-number through untouched", () => {
    const [d] = pixelsToFractions([detection("left", null)], 1932, 1288);
    expect(d.x).toBe("left");
    expect(d.y).toBeNull();
  });
});
