/**
 * The pixel variant of the reader accuracy test: today's Read sheet request
 * with the position words swapped, so the AI is asked for PIXELS of the
 * picture instead of 0-1 fractions of it. For scripts/readerAccuracy.mts.
 *
 * Why: Track A measured AI marks up to ~2.4 in of paper off, worse toward the
 * bottom of the sheet (2026-09-29) — a stretch, not a shift. One suspect is
 * the model estimating a fraction of a very large picture badly; asking for a
 * pixel position, with the picture's size stated, is the cheapest test of it.
 *
 * It changes three strings and nothing else, and it lives HERE rather than in
 * server/planReading.ts because this is a test of an idea, not a change to
 * Read sheet. The strings are matched exactly, and a mismatch throws, so the
 * day planReading.ts rewords its request the variant stops rather than quietly
 * sending today's request under a "pixels" label.
 * readerAccuracyPixels.test.ts runs this against the real request, so that
 * shows up as a red test rather than on a paid run.
 */
import type {
  sheetReadingRequest,
  SheetDetection,
} from "../server/planReading";

type ReadingRequest = ReturnType<typeof sheetReadingRequest>;

export const FRACTION_PROMPT_LINE =
  "- Give a position for every item, as a fraction of the image width and height.";
export const FRACTION_X =
  "Horizontal position, 0 at the left edge of the image to 1 at the right.";
export const FRACTION_Y =
  "Vertical position, 0 at the top edge of the image to 1 at the bottom.";

/** Swap one exact string, and refuse if it is not there to swap. */
function swapExact(text: string, from: string, to: string, where: string) {
  if (!text.includes(from)) {
    throw new Error(
      `The pixel variant could not find its words in ${where} — server/planReading.ts has changed. ` +
        "Update FRACTION_PROMPT_LINE / FRACTION_X / FRACTION_Y in scripts/readerAccuracyPixels.ts."
    );
  }
  return text.replace(from, to);
}

type ToolShape = Array<{
  function: {
    parameters: {
      properties: {
        items: {
          items: { properties: Record<string, { description: string }> };
        };
      };
    };
  };
}>;

/** Today's request, asking for pixel positions in a picture of this size. */
export function askForPixels(
  request: ReadingRequest,
  width: number,
  height: number
): ReadingRequest {
  if (!(width > 0 && height > 0)) {
    throw new Error(
      `The pixel variant needs the picture's size, got ${width} x ${height}.`
    );
  }
  const size = `${width} x ${height} pixels`;
  const system = request.messages[0];
  const tools = structuredClone(request.tools ?? []) as unknown as ToolShape;
  const props = tools[0]?.function.parameters.properties.items.items.properties;
  if (!props?.x || !props?.y) {
    throw new Error(
      "The pixel variant could not find x and y in the report_sheet tool — server/planReading.ts has changed."
    );
  }
  props.x.description = swapExact(
    props.x.description,
    FRACTION_X,
    `Horizontal position in PIXELS of this image, which is ${size}: 0 at the left edge to ${width} at the right. The centre of the symbol.`,
    "the tool's x"
  );
  props.y.description = swapExact(
    props.y.description,
    FRACTION_Y,
    `Vertical position in PIXELS of this image, which is ${size}: 0 at the top edge to ${height} at the bottom. The centre of the symbol.`,
    "the tool's y"
  );
  return {
    ...request,
    tools: tools as unknown as ReadingRequest["tools"],
    messages: [
      {
        ...system,
        content: swapExact(
          String(system.content),
          FRACTION_PROMPT_LINE,
          `- Give a position for every item, in pixels of the image you are shown (${size}), measured from its top-left corner, at the centre of the symbol.`,
          "the prompt"
        ),
      },
      ...request.messages.slice(1),
    ],
  };
}

/**
 * Pixel answers back to 0-1 of the picture, so both variants meet
 * buildFindings on the same footing — including its refusal of a position off
 * the picture, which a pixel answer past the edge becomes. Anything that is
 * not a number is passed through for buildFindings to reject as it would.
 */
export function pixelsToFractions(
  detections: SheetDetection[],
  width: number,
  height: number
): SheetDetection[] {
  return detections.map(d => ({
    ...d,
    x: typeof d.x === "number" ? d.x / width : d.x,
    y: typeof d.y === "number" ? d.y / height : d.y,
  }));
}
