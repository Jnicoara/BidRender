/**
 * The one door every AI call goes through.
 *
 * ── What it adds on top of "send the request" ────────────────────────────────
 * Three things, and they are here rather than in each router so that a feature
 * added later cannot forget them:
 *
 *   1. A DAILY LIMIT per user. Checked before the call, so a loop stops
 *      spending rather than being noticed afterwards.
 *   2. A COST LINE in the log, and a row in `ai_usage_daily`. Which feature,
 *      which model, how many tokens, what that works out to — never the prompt,
 *      never the reply, never the key.
 *   3. A PROVIDER choice: Anthropic when a key is set, the Manus gateway when
 *      only that is configured, and a clear refusal when neither is.
 *
 * ── Recording never breaks a call that worked ────────────────────────────────
 * The usage write is wrapped. If the database is unreachable the reading still
 * comes back and the estimator gets their answer; the cost line is still
 * logged, so the spend is not invisible, only unaggregated. Losing a row from
 * a spend report is a small problem. Losing a plan reading somebody waited
 * thirty seconds for, because the bookkeeping failed, is a bigger one.
 *
 * The limit is the other way round: if the counter cannot be READ, the call is
 * refused. A limit that fails open is not a limit, and the whole point of it is
 * the night nobody is watching.
 */
import type { InvokeParams, InvokeResult } from "../_core/llm";
import { anthropicConfigured, invokeAnthropic } from "./anthropic";
import {
  FEATURE_GROUP,
  checkDailyLimit,
  usageDay,
  type AiFeature,
} from "../../shared/aiLimits";
import { costMicros, formatMicros, unknownModel } from "../../shared/aiPricing";
import * as db from "../db";

export type { AiFeature };

/** Raised when a user has used up a feature's allowance for the day. */
export class AiLimitReached extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiLimitReached";
  }
}

export type MeteredInvokeParams = InvokeParams & {
  /** Which feature is calling, for the limit and the books. */
  feature: AiFeature;
  /**
   * Who is making the call. Routers pass `ctx.user`.
   *
   * ── Why the whole actor and not an id ─────────────────────────────────────
   * Because WHICH id meters a call is a decision, and it belongs here rather
   * than being made again in every router. The allowance is per PERSON, so
   * this is the acting user — not `ctx.scope.dataUserId`, which is the
   * company's data owner and would pool a whole company into one budget.
   *
   * Keeping that choice in one place also keeps the routers honest: they use
   * `ctx.scope.dataUserId` for every piece of data they touch, and
   * server/scopeDiscipline.test.ts enforces exactly that. A router reaching
   * for an actor id to spend an allowance would look, to that guard and to a
   * reader, like a router scoping data by the wrong id.
   */
  user: { id: number };
  /** Injected by tests; production uses the real clock. */
  now?: Date;
};

/**
 * How many calls this user has already made today in the calling feature's
 * group.
 *
 * Counted across the GROUP rather than the single feature, because the
 * allowance is a group allowance — reading a sheet and asking about one draw on
 * the same budget, since they cost about the same and serve the same task.
 */
async function callsTodayInGroup(
  userId: number,
  feature: AiFeature,
  day: string
): Promise<number> {
  const rows = await db.getAiCallsToday(userId, day);
  const group = FEATURE_GROUP[feature];
  return rows
    .filter(r => FEATURE_GROUP[r.feature as AiFeature] === group)
    .reduce((sum, r) => sum + r.calls, 0);
}

/**
 * Make an AI call, metered.
 *
 * Throws `AiLimitReached` when the allowance is gone — the callers turn that
 * into their own graceful answer rather than an error page, because every AI
 * feature in this app degrades to useful-without-it.
 */
export async function invokeLLM(
  params: MeteredInvokeParams
): Promise<InvokeResult> {
  const { feature, user, now = new Date(), ...request } = params;
  const userId = user.id;
  const day = usageDay(now);

  const used = await callsTodayInGroup(userId, feature, day);
  const limit = checkDailyLimit(feature, used);
  if (!limit.allowed) {
    console.warn(
      `[llm-limit] feature=${feature} user=${userId} day=${day} used=${used} — refused`
    );
    throw new AiLimitReached(limit.message);
  }

  const startedAt = Date.now();
  let result: InvokeResult;

  if (anthropicConfigured()) {
    result = await invokeAnthropic(request);
  } else {
    // The Manus gateway, while it is still reachable. Imported lazily so a
    // deployment with only an Anthropic key never loads it.
    const { invokeLLM: viaForge } = await import("../_core/llm");
    result = await viaForge(request);
  }

  const model = request.model ?? "unknown";
  const usage = {
    inputTokens: Number(result.usage?.prompt_tokens ?? 0),
    outputTokens: Number(result.usage?.completion_tokens ?? 0),
  };
  const micros = costMicros(model, usage);

  /**
   * The cost line. Deliberately flat key=value so it greps cleanly out of a
   * hosting provider's log viewer, and deliberately contains nothing but
   * arithmetic — no prompt, no question, no drawing text, no reply.
   */
  console.log(
    `[llm-cost] feature=${feature} model=${model} user=${userId} ` +
      `in=${usage.inputTokens} out=${usage.outputTokens} ` +
      `cost=${(micros / 1_000_000).toFixed(4)} ms=${Date.now() - startedAt}`
  );

  if (unknownModel(model)) {
    // Visible, because the spend report is now undercounting and the only fix
    // is a line in shared/aiPricing.ts.
    console.warn(
      `[llm-cost] no price on file for model=${model} — its spend is being recorded as zero.`
    );
  }

  try {
    await db.recordAiUsage({
      userId,
      day,
      feature,
      model,
      ...usage,
      costMicros: micros,
    });
  } catch (error) {
    console.warn(
      `[llm-cost] could not record usage for feature=${feature} user=${userId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return result;
}

/** Re-exported so the admin screen and tests share one formatter. */
export { formatMicros };
