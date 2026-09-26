/**
 * What actually goes on the wire.
 *
 * ── Why this file exists separately from anthropicAdapter.test.ts ────────────
 * That file tests the translation FUNCTIONS. This one tests that their output
 * reaches the request, and the distinction is the entire bug it was written
 * for: `thinking` had a perfectly good type on `InvokeParams`, a caller could
 * set it, and the adapter never put it in the object it sent. Nothing was
 * mistranslated. It simply was not wired, and no test of a translation function
 * could ever have noticed.
 *
 * So these assert against the argument handed to the SDK, which is the only
 * place the difference between "handled" and "silently absent" is visible.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invokeAnthropic, resetAnthropicForTests } from "./llm/anthropic";

/*
  vi.hoisted, because vi.mock is hoisted above the imports and its factory
  needs `create`. This used to declare `create` normally and then load the
  adapter with a top-level `await import(...)` so the mock factory would find
  it — which does not compile under this tsconfig (no `target`, so no
  top-level await). vi.hoisted is vitest's own answer to the same ordering
  problem: `create` now exists before anything is imported.

  The mock is load-bearing, and measured to be: with it removed, 8 of these
  10 tests fail, because they read what the SDK was sent through `sent()`.
  The other 2 check that a bad request is refused before any call is made,
  which holds with or without a mock.
*/
const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

/** A minimal well-formed reply, so the adapter's own parsing is satisfied. */
const REPLY = {
  id: "msg_1",
  model: "claude-sonnet-5",
  content: [{ type: "text", text: "ok" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
};

const base = {
  model: "claude-sonnet-5",
  maxTokens: 500,
  messages: [{ role: "user" as const, content: "Read this sheet." }],
};

/** What the adapter passed to the SDK on the most recent call. */
const sent = () => create.mock.calls.at(-1)![0] as Record<string, unknown>;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key-not-used-outside-vitest";
  resetAnthropicForTests();
  create.mockReset();
  create.mockResolvedValue(REPLY);
});

describe("the parameters that were being dropped", () => {
  it("puts thinking in the request when a caller disables it", async () => {
    await invokeAnthropic({ ...base, thinking: { type: "disabled" } });
    expect(sent().thinking).toEqual({ type: "disabled" });
  });

  /**
   * The money test. Omitting `thinking` does not mean "no thinking" on the
   * current models — it means adaptive thinking runs and bills at the output
   * rate. So the adapter must send exactly what the caller chose and never
   * substitute a default of its own, in either direction.
   */
  it("sends no thinking key at all when the caller said nothing", async () => {
    await invokeAnthropic({ ...base });
    expect(sent()).not.toHaveProperty("thinking");
  });

  it("puts tool_choice in the request alongside the tools", async () => {
    await invokeAnthropic({
      ...base,
      tools: [{ type: "function", function: { name: "report_sheet" } }],
      toolChoice: "required",
    });
    expect(sent().tool_choice).toEqual({ type: "any" });
  });

  it("accepts the snake_case spelling the type also advertises", async () => {
    await invokeAnthropic({
      ...base,
      tools: [{ type: "function", function: { name: "report_sheet" } }],
      tool_choice: { name: "report_sheet" },
    });
    expect(sent().tool_choice).toEqual({ type: "tool", name: "report_sheet" });
  });

  /**
   * Anthropic rejects a tool_choice with nothing to choose from. A caller that
   * sets one without tools has made a mistake, and turning that into a failed
   * API round trip would bill for the privilege.
   */
  it("omits tool_choice when there are no tools to choose from", async () => {
    await invokeAnthropic({ ...base, toolChoice: "auto" });
    expect(sent()).not.toHaveProperty("tool_choice");
  });
});

describe("the parameters that were already wired", () => {
  it("still sends the model, the ceiling and the turns", async () => {
    await invokeAnthropic({ ...base });
    expect(sent().model).toBe("claude-sonnet-5");
    expect(sent().max_tokens).toBe(500);
    expect(sent().messages).toHaveLength(1);
  });

  it("still lifts the system prompt into its own field", async () => {
    await invokeAnthropic({
      ...base,
      messages: [
        { role: "system", content: "You read electrical drawings." },
        { role: "user", content: "What is here?" },
      ],
    });
    expect(sent().system).toBe("You read electrical drawings.");
    expect(sent().messages).toHaveLength(1);
  });

  it("sends no tools key when the caller gave none", async () => {
    await invokeAnthropic({ ...base });
    expect(sent()).not.toHaveProperty("tools");
  });
});

describe("a rejected parameter never reaches the API", () => {
  /**
   * Costs matter here. If the adapter threw AFTER the request, an unsupported
   * parameter would be billed for before being refused.
   */
  it("refuses before spending a call", async () => {
    await expect(
      invokeAnthropic({ ...base, reasoning: { effort: "low" } })
    ).rejects.toThrow(/reasoning/);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses an untranslatable document before spending a call", async () => {
    await expect(
      invokeAnthropic({
        ...base,
        messages: [
          {
            role: "user",
            content: [{ type: "file_url", file_url: { url: "https://x/y" } }],
          },
        ],
      })
    ).rejects.toThrow(/file_url/);
    expect(create).not.toHaveBeenCalled();
  });
});
