/**
 * The OpenAI-shaped request and reply every AI caller in the app speaks.
 * `server/llm` is the one door (limits, cost line, provider), and
 * `server/llm/anthropic.ts` translates these shapes to Anthropic's.
 *
 * Types only since 2026-10-16. This file also held the Manus "Forge" gateway
 * call (`invokeLLM`, `listLLMModels`, retries, BUILT_IN_FORGE_API_*): its key
 * was set nowhere after the move to DigitalOcean, so it could not run, and it
 * carried a second, unguarded copy of the parameter-dropping bug the
 * Anthropic adapter was fixed for (todo.md, "Delete the Manus Forge gateway
 * path"). The model-exists guards it served now ask Anthropic
 * (`anthropicModelExists`).
 */
export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  /**
   * Give up after this long, retries included, and fail the call (which the
   * caller's catch turns into its graceful answer). For a BUTTON someone is
   * watching. Unset keeps the provider default — 120 s a try, 2 retries —
   * which the failure drill measured at 361 s before "Find it" answered a
   * hung service (2026-10-14, references/stress-results.md).
   */
  timeoutMs?: number;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };
