/**
 * The reader's request and reply parsing, on their own.
 *
 * The router tests (planCopilot.test.ts) cover these through a full read. What
 * they did not cover is the token-ceiling case, and the two request settings
 * whose absence costs money silently: thinking off and the output cap.
 */
import { describe, expect, it } from "vitest";
import type { InvokeResult } from "./_core/llm";
import {
  PLAN_READ_MAX_TOKENS,
  parseSheetReading,
  sheetReadingRequest,
} from "./planReading";

function reply(
  message: InvokeResult["choices"][number]["message"],
  finish_reason: string | null = "tool_use"
): InvokeResult {
  return {
    id: "r",
    created: 0,
    model: "m",
    choices: [{ index: 0, message, finish_reason }],
  };
}

function reportCall(args: unknown): InvokeResult {
  return reply({
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "t",
        type: "function",
        function: { name: "report_sheet", arguments: JSON.stringify(args) },
      },
    ],
  });
}

describe("sheetReadingRequest", () => {
  const request = sheetReadingRequest({
    model: "claude-sonnet-5",
    symbols: [
      { id: 1, label: "Duplex", assemblyId: 9, assemblyName: "Duplex std" },
    ],
    sheetName: "E1.02",
    pageText: "",
    pageImage: "data:image/jpeg;base64,AAAA",
  });

  it("turns thinking off and caps the reply, explicitly", () => {
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(request.maxTokens).toBe(PLAN_READ_MAX_TOKENS);
  });

  it("names the legend and the sheet in the instructions", () => {
    const system = request.messages[0];
    expect(system.role).toBe("system");
    expect(String(system.content)).toContain('"Duplex"');
    expect(String(system.content)).toContain('"E1.02"');
  });

  it("sends the page image untouched and says when there is no text", () => {
    const parts = request.messages[1].content;
    expect(Array.isArray(parts)).toBe(true);
    const list = parts as Array<Record<string, unknown>>;
    expect(list[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    });
    expect(String(list[0].text)).toContain("No text could be extracted");
  });
});

describe("parseSheetReading", () => {
  it("reports a cut-off reply as truncated, before trying to parse it", () => {
    const cut = reply(
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "t",
            type: "function",
            function: { name: "report_sheet", arguments: '{"items": [{"x"' },
          },
        ],
      },
      "max_tokens"
    );
    expect(parseSheetReading(cut)).toEqual({ kind: "truncated" });
  });

  it("keeps the prose when there is no report", () => {
    const prose = reply({ role: "assistant", content: "  I see a plan. " });
    expect(parseSheetReading(prose)).toEqual({
      kind: "no-report",
      text: "I see a plan.",
    });
  });

  it("returns unparseable arguments rather than guessing", () => {
    const bad = reply({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "t",
          type: "function",
          function: { name: "report_sheet", arguments: "{items: [oops" },
        },
      ],
    });
    expect(parseSheetReading(bad)).toEqual({
      kind: "unparseable",
      raw: "{items: [oops",
    });
  });

  it("drops and counts a writing action, and a flag is never legible", () => {
    const reading = parseSheetReading(
      reportCall({
        summary: "  Power plan.  ",
        items: [
          { action: "propose_stamp", symbol: "Duplex", x: 0.1, y: 0.2 },
          { action: "confirm_stamps", symbol: "Duplex", x: 0.3, y: 0.4 },
          {
            action: "flag_for_review",
            symbol: "",
            x: 0.5,
            y: 0.6,
            legible: true,
          },
          { symbol: "Quad", x: 0.7, y: 0.8 },
        ],
      })
    );
    expect(reading.kind).toBe("ok");
    if (reading.kind !== "ok") return;
    expect(reading.summary).toBe("Power plan.");
    expect(reading.refused).toBe(1);
    expect(reading.detections.map(d => d.symbol)).toEqual([
      "Duplex",
      "",
      "Quad",
    ]);
    expect(reading.detections[1].legible).toBe(false);
  });
});
