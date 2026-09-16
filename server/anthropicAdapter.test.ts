/**
 * Translating between the shape the app speaks and the shape Anthropic does.
 *
 * ── Why this is the riskiest file in the change ──────────────────────────────
 * Every mistake it can make is silent. Drop the system prompt and the plan
 * reader still answers — worse, and nobody knows why. Fail to split a data URL
 * and the image is sent as a link, so the model reads a sheet it never saw and
 * reports confidently on nothing. Hand back tool arguments as an object where
 * the caller expects a JSON string and `JSON.parse` throws into a catch block
 * that was written for a different failure.
 *
 * None of those raise an error. All of them produce an app that looks like it
 * works. So the cases below are mostly about the pieces arriving intact.
 */
import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { splitMessages, toInvokeResult } from "./llm/anthropic";
import type { Message } from "./_core/llm";

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("splitting the app's messages", () => {
  /**
   * OpenAI-shaped APIs carry the system prompt as the first message; Anthropic
   * takes it as its own field. Left in the messages array it would be sent as
   * a user turn — the model would still answer, and every instruction in it
   * would carry the authority of a user rather than the operator.
   */
  it("lifts the system prompt out of the turns", () => {
    const { system, turns } = splitMessages([
      { role: "system", content: "You read electrical drawings." },
      { role: "user", content: "What is on this sheet?" },
    ]);
    expect(system).toBe("You read electrical drawings.");
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe("user");
  });

  it("joins several system messages in order", () => {
    const { system } = splitMessages([
      { role: "system", content: "First." },
      { role: "system", content: "Second." },
      { role: "user", content: "Go." },
    ]);
    expect(system).toBe("First.\n\nSecond.");
  });

  it("keeps an assistant turn as an assistant turn", () => {
    const { turns } = splitMessages([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
    expect(turns.map(t => t.role)).toEqual(["user", "assistant", "user"]);
  });

  it("has no system prompt when none was given", () => {
    expect(splitMessages([{ role: "user", content: "hello" }]).system).toBe("");
  });

  it("drops empty content rather than sending a blank turn", () => {
    // Anthropic rejects a message with no content, which would turn a missing
    // optional field into a failed call.
    const { turns } = splitMessages([
      { role: "user", content: "" },
      { role: "user", content: "real" },
    ]);
    expect(turns).toHaveLength(1);
  });
});

describe("sending a drawing", () => {
  const withImage: Message[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "Read this." },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${PNG_1x1}` },
        },
      ],
    },
  ];

  /**
   * The one that would be hardest to spot. A data URL passed through as a URL
   * means the model is handed a link it cannot fetch — so it reads nothing and
   * answers from the extracted text alone, confidently, with no error anywhere.
   */
  it("takes a data URL apart into base64 and a media type", () => {
    const { turns } = splitMessages(withImage);
    const blocks = turns[0].content as Anthropic.ContentBlockParam[];
    const image = blocks.find(b => b.type === "image");
    expect(image).toBeTruthy();
    const source = (image as Anthropic.ImageBlockParam).source;
    expect(source.type).toBe("base64");
    if (source.type !== "base64") return;
    expect(source.media_type).toBe("image/png");
    expect(source.data).toBe(PNG_1x1);
    // And nothing of the data-URL wrapper came along.
    expect(source.data).not.toMatch(/^data:/);
  });

  it("keeps the text alongside the image", () => {
    const { turns } = splitMessages(withImage);
    const blocks = turns[0].content as Anthropic.ContentBlockParam[];
    expect(blocks.filter(b => b.type === "text")).toHaveLength(1);
    expect(blocks).toHaveLength(2);
  });

  it("handles a jpeg as readily as a png", () => {
    const { turns } = splitMessages([
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64,AAA" },
          },
        ],
      },
    ]);
    const source = (
      (
        turns[0].content as Anthropic.ContentBlockParam[]
      )[0] as Anthropic.ImageBlockParam
    ).source;
    expect(source.type === "base64" && source.media_type).toBe("image/jpeg");
  });

  it("passes a real URL through as a URL", () => {
    const { turns } = splitMessages([
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "https://example.com/sheet.png" },
          },
        ],
      },
    ]);
    const source = (
      (
        turns[0].content as Anthropic.ContentBlockParam[]
      )[0] as Anthropic.ImageBlockParam
    ).source;
    expect(source.type).toBe("url");
  });

  it("survives a base64 payload with newlines in it", () => {
    // A 3MB drawing is one enormous run of characters, and some encoders wrap
    // it. A pattern that stops at a newline would truncate the image.
    const wrapped = `data:image/png;base64,AAAA\nBBBB\nCCCC`;
    const { turns } = splitMessages([
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: wrapped } }],
      },
    ]);
    const source = (
      (
        turns[0].content as Anthropic.ContentBlockParam[]
      )[0] as Anthropic.ImageBlockParam
    ).source;
    expect(source.type).toBe("base64");
    if (source.type !== "base64") return;
    expect(source.data).toBe("AAAA\nBBBB\nCCCC");
  });
});

describe("reading the reply back", () => {
  const reply = (content: Anthropic.ContentBlock[]): Anthropic.Message =>
    ({
      id: "msg_1",
      model: "claude-sonnet-5",
      role: "assistant",
      type: "message",
      content,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 7300, output_tokens: 1840 },
    }) as Anthropic.Message;

  it("puts the text where the callers look for it", () => {
    const result = toInvokeResult(
      reply([{ type: "text", text: "Two panels.", citations: null } as never])
    );
    expect(result.choices?.[0]?.message?.content).toBe("Two panels.");
  });

  it("joins several text blocks", () => {
    const result = toInvokeResult(
      reply([
        { type: "text", text: "One. ", citations: null } as never,
        { type: "text", text: "Two.", citations: null } as never,
      ])
    );
    expect(result.choices?.[0]?.message?.content).toBe("One. Two.");
  });

  /**
   * Arguments go back to being a JSON STRING. Every caller does
   * `JSON.parse(call.function.arguments)` inside a try/catch written for a
   * model that returned malformed JSON. Hand them an object and the parse
   * throws on a value that was perfectly fine, and the feature silently falls
   * back for a reason that never happened.
   */
  it("gives tool arguments back as a JSON string", () => {
    const result = toInvokeResult(
      reply([
        {
          type: "tool_use",
          id: "tu_1",
          name: "go_to_screen",
          input: { target: "materials", reason: "pricing" },
        } as never,
      ])
    );
    const call = result.choices?.[0]?.message?.tool_calls?.[0];
    expect(call?.function?.name).toBe("go_to_screen");
    expect(typeof call?.function?.arguments).toBe("string");
    expect(JSON.parse(call!.function!.arguments)).toEqual({
      target: "materials",
      reason: "pricing",
    });
  });

  it("has no tool_calls key at all when no tool was used", () => {
    // The callers check `tool_calls?.[0]`; an empty array would be falsy-safe
    // but an unexpected shape, so absent is what the old gateway did.
    const result = toInvokeResult(
      reply([{ type: "text", text: "just words", citations: null } as never])
    );
    expect(result.choices?.[0]?.message?.tool_calls).toBeUndefined();
  });

  it("carries the token counts through, because the cost depends on them", () => {
    const result = toInvokeResult(reply([]));
    expect(result.usage?.prompt_tokens).toBe(7300);
    expect(result.usage?.completion_tokens).toBe(1840);
  });

  it("reports both text and a tool call when the model sent both", () => {
    const result = toInvokeResult(
      reply([
        { type: "text", text: "Reading it.", citations: null } as never,
        { type: "tool_use", id: "t", name: "report_sheet", input: {} } as never,
      ])
    );
    expect(result.choices?.[0]?.message?.content).toBe("Reading it.");
    expect(result.choices?.[0]?.message?.tool_calls).toHaveLength(1);
  });
});
