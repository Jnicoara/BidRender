/**
 * A DEAD AI KEY MUST SAY SO (todo.md "A dead AI key must SAY so", built
 * 2026-10-09; references/deploying.md § 8a).
 *
 *   1. The door tells a refused key (401/403) and a missing key apart from a
 *      failure that passes (timeout, overload, 5xx) — by the SDK's own error
 *      type and status, built here as the real SDK objects, never by words.
 *   2. A refusal is noted on `ai_service_status` (0141): `refusedSince` is the
 *      FIRST of the run and survives later refusals; a call that works clears
 *      it. Nothing else is written — no usage row for a refused call.
 *   3. The admin `spend` report carries it, and the notice says what is wrong.
 *
 * The routers' sentences are tested where their suites already are:
 * server/navigation.test.ts and server/planCopilot.test.ts.
 *
 * Fixture user 91360 is this file's own.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";

vi.mock("./llm/anthropic", async () => {
  const actual =
    await vi.importActual<typeof import("./llm/anthropic")>("./llm/anthropic");
  return {
    ...actual,
    anthropicConfigured: vi.fn(() => true),
    invokeAnthropic: vi.fn(),
  };
});

import { anthropicConfigured, invokeAnthropic } from "./llm/anthropic";
import { AiUnavailable, invokeLLM } from "./llm";
import { keyRefusal } from "./llm/unavailable";
import { ENV } from "./_core/env";
import { getDb, getAiServiceStatus } from "./db";
import { aiServiceStatus, aiUsageDaily, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { aiRefusalNotice } from "../shared/aiServiceNotice";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 91360;
dropFixtureUsersAfterAll([USER]);

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = describe.skipIf(!hasDb);

/** A real SDK error for an HTTP status, as the SDK itself builds one. */
const apiError = (status: number, type: string) =>
  Anthropic.APIError.generate(
    status,
    { type: "error", error: { type, message: "probe" } },
    `${status} probe`,
    new Headers()
  );

const REQUEST = {
  feature: "navigation" as const,
  user: { id: USER },
  model: "claude-haiku-4-5-20251001",
  messages: [{ role: "user" as const, content: "where are labor rates" }],
  maxTokens: 5,
};

const OK_RESULT = {
  id: "x",
  created: 0,
  model: "claude-haiku-4-5-20251001",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "ok" },
      finish_reason: "end_turn",
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

describe("keyRefusal — which failures will not pass on their own", () => {
  it("a 401 (expired, disabled or wrong key) and a 403 are refusals", () => {
    const expired = apiError(401, "authentication_error");
    expect(expired).toBeInstanceOf(Anthropic.AuthenticationError);
    expect(keyRefusal(expired)).toBe("key-refused");
    expect(keyRefusal(apiError(403, "permission_error"))).toBe("key-refused");
  });

  it("a timeout, a rate limit, an overload and a server error are NOT — they pass", () => {
    expect(keyRefusal(apiError(429, "rate_limit_error"))).toBeNull();
    expect(keyRefusal(apiError(529, "overloaded_error"))).toBeNull();
    expect(keyRefusal(apiError(500, "api_error"))).toBeNull();
    expect(
      keyRefusal(new Anthropic.APIConnectionTimeoutError({ message: "slow" }))
    ).toBeNull();
    expect(keyRefusal(new Error("invalid x-api-key"))).toBeNull();
  });
});

describe("the admin notice", () => {
  it("says nothing while calls are not being refused", () => {
    expect(aiRefusalNotice(null)).toBeNull();
    expect(
      aiRefusalNotice({
        refusedSince: null,
        lastRefusedAt: new Date(),
        lastRefusalReason: "key-refused",
      })
    ).toBeNull();
  });

  it("names the fault and where the fix is written, for each reason", () => {
    const since = "2026-10-09T14:02:00.000Z";
    const refused = aiRefusalNotice({
      refusedSince: since,
      lastRefusedAt: since,
      lastRefusalReason: "key-refused",
    });
    expect(refused?.since.toISOString()).toBe(since);
    expect(refused?.message).toMatch(/refusing this server's key/);
    expect(refused?.message).toMatch(/deploying\.md § 8a/);
    const none = aiRefusalNotice({
      refusedSince: since,
      lastRefusedAt: since,
      lastRefusalReason: "no-key",
    });
    expect(none?.message).toMatch(/no Anthropic key \(ANTHROPIC_API_KEY\)/);
  });
});

withDb("the door, on a database", () => {
  const forgeKey = ENV.forgeApiKey;

  beforeAll(async () => {
    const db = (await getDb())!;
    await db
      .insert(users)
      .values({
        id: USER,
        openId: `test-ai-unavailable-${USER}`,
        name: "AI unavailable fixture",
      })
      .onDuplicateKeyUpdate({ set: { name: "AI unavailable fixture" } });
    // No gateway either, so "no key" really is no key.
    ENV.forgeApiKey = "";
  });

  beforeEach(async () => {
    const db = (await getDb())!;
    await db.delete(aiServiceStatus);
    await db.delete(aiUsageDaily).where(eq(aiUsageDaily.userId, USER));
    vi.mocked(anthropicConfigured).mockReturnValue(true);
    vi.mocked(invokeAnthropic).mockReset();
  });

  afterAll(async () => {
    ENV.forgeApiKey = forgeKey;
    const db = (await getDb())!;
    await db.delete(aiServiceStatus);
  });

  const usageRows = async () => {
    const db = (await getDb())!;
    return db.select().from(aiUsageDaily).where(eq(aiUsageDaily.userId, USER));
  };

  it("a refused key is AiUnavailable, noted with when it STARTED, and writes no usage", async () => {
    vi.mocked(invokeAnthropic).mockRejectedValue(
      apiError(401, "authentication_error")
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = new Date("2026-10-09T14:02:00.000Z");
    const later = new Date("2026-10-09T15:30:00.000Z");

    const thrown = await invokeLLM({ ...REQUEST, now: first }).catch(e => e);
    expect(thrown).toBeInstanceOf(AiUnavailable);
    expect((thrown as AiUnavailable).reason).toBe("key-refused");
    await invokeLLM({ ...REQUEST, now: later }).catch(() => {});

    const status = await getAiServiceStatus();
    expect(status?.refusedSince?.toISOString()).toBe(first.toISOString());
    expect(status?.lastRefusedAt?.toISOString()).toBe(later.toISOString());
    expect(status?.lastRefusalReason).toBe("key-refused");
    expect(await usageRows()).toEqual([]);
  });

  it("no key at all is AiUnavailable 'no-key' — not the old gateway's OPENAI error", async () => {
    vi.mocked(anthropicConfigured).mockReturnValue(false);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const thrown = await invokeLLM(REQUEST).catch(e => e);
    expect(thrown).toBeInstanceOf(AiUnavailable);
    expect((thrown as AiUnavailable).reason).toBe("no-key");
    expect((await getAiServiceStatus())?.lastRefusalReason).toBe("no-key");
  });

  it("a failure that passes goes up unchanged and notes nothing", async () => {
    const overloaded = apiError(529, "overloaded_error");
    vi.mocked(invokeAnthropic).mockRejectedValue(overloaded);
    const thrown = await invokeLLM(REQUEST).catch(e => e);
    expect(thrown).toBe(overloaded);
    expect(thrown).not.toBeInstanceOf(AiUnavailable);
    expect(await getAiServiceStatus()).toBeNull();
  });

  it("the next call that works clears 'refused since'", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(invokeAnthropic).mockRejectedValueOnce(
      apiError(401, "authentication_error")
    );
    await invokeLLM(REQUEST).catch(() => {});
    expect((await getAiServiceStatus())?.refusedSince).not.toBeNull();

    vi.mocked(invokeAnthropic).mockResolvedValueOnce(OK_RESULT as never);
    const worked = new Date("2026-10-10T09:00:00.000Z");
    await invokeLLM({ ...REQUEST, now: worked });
    const status = await getAiServiceStatus();
    expect(status?.refusedSince).toBeNull();
    expect(status?.lastWorkedAt?.toISOString()).toBe(worked.toISOString());
    expect(await usageRows()).toHaveLength(1);
  });

  it("the admin spend report carries it, and only to an admin", async () => {
    vi.mocked(invokeAnthropic).mockRejectedValue(
      apiError(401, "authentication_error")
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const since = new Date("2026-10-09T14:02:00.000Z");
    await invokeLLM({ ...REQUEST, now: since }).catch(() => {});

    const as = (role: "admin" | "user") =>
      appRouter.createCaller({
        user: { id: USER, openId: `test-ai-unavailable-${USER}`, role },
      } as unknown as TrpcContext);
    const spend = await as("admin").aiUsage.spend();
    expect(spend.service?.refusedSince?.toISOString()).toBe(
      since.toISOString()
    );
    expect(spend.service?.lastRefusalReason).toBe("key-refused");
    await expect(as("user").aiUsage.spend()).rejects.toThrow();
  });
});
