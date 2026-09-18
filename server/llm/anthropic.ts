/**
 * Calling Anthropic directly, in the shape the app already speaks.
 *
 * ── Why a translation layer rather than rewriting the callers ────────────────
 * The three AI features were written against the Manus Forge gateway, which
 * speaks an OpenAI-shaped protocol: `messages` with `role`/`content`, a reply
 * under `choices[0].message`, tool calls as `{function: {name, arguments}}`
 * where the arguments are a JSON *string*. Anthropic's API is a different
 * shape — a top-level `system`, `tool_use` content blocks, arguments as a
 * parsed object.
 *
 * Both shapes could be argued for. What matters is that translating once, here,
 * touches one file, while rewriting the callers touches three routers and the
 * prompt-and-response handling inside each — including a plan reader whose
 * result parsing is the part that must not break. So this maps Anthropic's
 * answer back into the shape the callers already read, and they change by one
 * import line.
 *
 * The cost of that choice, stated plainly: this file is now the only place that
 * knows both shapes, and a feature wanting something Anthropic-specific
 * (thinking blocks, server tools, streaming) will have to reach past it. That
 * is the right time to revisit this, not now.
 *
 * ── The key never leaves the server ──────────────────────────────────────────
 * Read from `process.env` at call time, with no `VITE_` prefix anywhere near
 * it: Vite inlines every `VITE_*` variable into the client bundle, so a key
 * named that way is published to every visitor.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { InvokeParams, InvokeResult, Message, Tool } from "../_core/llm";

/** How long one call may take before it is abandoned. */
const REQUEST_TIMEOUT_MS = 120_000;

let cached: Anthropic | null = null;

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function client(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set on this server.");
  }
  cached = new Anthropic({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 2,
  });
  return cached;
}

/** Drop the memoised client. For tests that change the environment. */
export function resetAnthropicForTests(): void {
  cached = null;
}

/**
 * One part of a message, in Anthropic's vocabulary.
 *
 * The app sends images as `{type: "image_url", image_url: {url}}` with a data
 * URL, because that is what the old gateway took. Anthropic wants the base64
 * and the media type separately, so the data URL is taken apart here.
 */
function toContentBlocks(
  content: Message["content"]
): Anthropic.ContentBlockParam[] {
  const parts = Array.isArray(content) ? content : [content];
  const blocks: Anthropic.ContentBlockParam[] = [];

  for (const part of parts) {
    if (typeof part === "string") {
      if (part) blocks.push({ type: "text", text: part });
      continue;
    }
    if (part.type === "text") {
      if (part.text) blocks.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type === "image_url") {
      const url = part.image_url.url;
      // [\s\S] rather than the `s` flag, which needs a newer compile target.
      // It must match everything: base64 of a 3MB drawing is one enormous run
      // of characters and a stricter class would quietly fail to match, send
      // the data URL as if it were a real URL, and produce a reading of nothing.
      const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(url);
      if (match) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: match[1] as "image/png" | "image/jpeg" | "image/webp",
            data: match[2],
          },
        });
      } else {
        blocks.push({ type: "image", source: { type: "url", url } });
      }
      continue;
    }
    // `file_url` was a Forge extension with no Anthropic equivalent in use
    // here. Dropped rather than guessed at: a silently mistranslated document
    // would produce a confidently wrong reading.
  }

  return blocks;
}

/**
 * Split the app's message list into Anthropic's `system` + `messages`.
 *
 * OpenAI-shaped APIs carry the system prompt as the first message; Anthropic
 * takes it as its own top-level field. Several system messages are joined, in
 * order, because that is what the gateway did with them.
 */
export function splitMessages(messages: Message[]): {
  system: string;
  turns: Anthropic.MessageParam[];
} {
  const system: string[] = [];
  const turns: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      const text = toContentBlocks(message.content)
        .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
        .map(b => b.text)
        .join("\n");
      if (text) system.push(text);
      continue;
    }
    // `tool` and `function` roles are not used by any caller here. Folded into
    // a user turn rather than dropped, so a future caller gets something
    // rather than silence.
    const role = message.role === "assistant" ? "assistant" : "user";
    const content = toContentBlocks(message.content);
    if (content.length > 0) turns.push({ role, content });
  }

  return { system: system.join("\n\n"), turns };
}

/** The app's tool shape (OpenAI functions) as Anthropic tools. */
function toTools(tools: Tool[] | undefined): Anthropic.Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: (tool.function.parameters ?? {
      type: "object",
      properties: {},
    }) as Anthropic.Tool.InputSchema,
  }));
}

/**
 * Anthropic's reply, in the shape the callers read.
 *
 * Tool arguments go back to being a JSON *string*, because that is what the
 * callers `JSON.parse`. Round-tripping through a string looks wasteful and is
 * deliberate: it keeps the callers' existing tolerance for malformed arguments,
 * which is a real code path they each handle.
 */
export function toInvokeResult(message: Anthropic.Message): InvokeResult {
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");

  const toolCalls = message.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map(b => ({
      id: b.id,
      type: "function" as const,
      function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
    }));

  return {
    id: message.id,
    model: message.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: message.stop_reason ?? null,
      },
    ],
    usage: {
      prompt_tokens: message.usage.input_tokens,
      completion_tokens: message.usage.output_tokens,
      total_tokens: message.usage.input_tokens + message.usage.output_tokens,
    },
  } as unknown as InvokeResult;
}

/**
 * Make one call.
 *
 * `max_tokens` is required by Anthropic and is never left to a default here:
 * every caller sets its own ceiling, because an unbounded reply is the one
 * thing that turns a bug into a bill. See shared/aiLimits.ts.
 */
export async function invokeAnthropic(
  params: InvokeParams
): Promise<InvokeResult> {
  const maxTokens = params.maxTokens ?? params.max_tokens;
  if (!maxTokens || maxTokens <= 0) {
    throw new Error(
      "An AI call must set maxTokens. An unbounded reply has no cost ceiling."
    );
  }
  if (!params.model) {
    throw new Error("An AI call must name a model.");
  }

  const { system, turns } = splitMessages(params.messages);

  /**
   * ── Thinking is ON unless a caller says otherwise, and that is easy to miss ─
   * On the current models, OMITTING `thinking` does not mean "no thinking" — it
   * means adaptive thinking runs. Those tokens bill at the OUTPUT rate, which
   * is five times the input rate, and they arrive folded into
   * `usage.output_tokens` with nothing distinguishing them. So a caller that
   * simply never mentioned thinking has been paying for it invisibly.
   *
   * Measured on a real 36x24 electrical sheet, that was roughly three cents per
   * sheet read that nobody chose. Hence this passthrough: a caller that wants
   * thinking asks for it, and a caller that does not sends
   * `{ type: "disabled" }` and gets a bill it can predict.
   *
   * Only sent when the caller set it, because the accepted shape differs by
   * model generation and an unasked-for `thinking` is exactly the kind of
   * silent default this comment exists to complain about. A model that rejects
   * the shape a caller chose fails the call, which lands in that caller's
   * existing catch and degrades gracefully — visible, not silent.
   */
  const message = await client().messages.create({
    model: params.model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: turns,
    ...(toTools(params.tools) ? { tools: toTools(params.tools)! } : {}),
    // Cast through `unknown`: the caller's shape is an open record by design
    // (see _core/llm.ts), and the SDK's union covers only the shapes the
    // pinned version knows about. Narrowing it here would mean this file
    // having an opinion about which thinking modes exist, which is the one
    // thing the translation layer is supposed not to have.
    ...(params.thinking
      ? {
          thinking: params.thinking as unknown as Anthropic.ThinkingConfigParam,
        }
      : {}),
  });

  return toInvokeResult(message);
}
