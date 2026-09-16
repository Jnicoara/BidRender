/**
 * "Where do I go?" — a plain-language navigation helper.
 *
 * ── Deliberately the cheapest thing that works ───────────────────────────────
 * This is lookup and routing, not reasoning. The user types "where do I edit
 * labor rates" and the answer is one of eleven screens. So it runs on the fast,
 * low-cost model tier: the heavier tier is reserved for work that actually
 * needs it, and spending it here would make a help feature cost more per use
 * than the estimating it is helping with.
 *
 * ── The model chooses between options; it never constructs one ───────────────
 * It cannot return a URL. It picks an id from NAVIGATION_TARGETS, and that id
 * is resolved against the same list here before anything is sent back — so an
 * invented destination becomes a text-only answer rather than a dead link. See
 * shared/navigationTargets.ts; this file must not grow its own idea of where
 * the app's screens are.
 *
 * ── It degrades to nothing worse than unhelpful ──────────────────────────────
 * No API key, a refusal, a timeout, unparseable output: all of them return a
 * plain "I'm not sure" with the list of screens. Navigation must never depend
 * on this working.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import type { Tool } from "../_core/llm";
import { AiLimitReached, invokeLLM } from "../llm";
import { aiFeaturesEnabled } from "../aiFeatures";
import {
  NAVIGATION_TARGETS,
  NAVIGATION_TARGET_IDS,
  resolveNavigationTarget,
} from "../../shared/navigationTargets";

/**
 * Claude, cheapest tier, overridable per deployment.
 *
 * ── Claude, because one vendor is enough ─────────────────────────────────────
 * The alias suggester already runs on Claude and the planned co-pilot will too.
 * A second provider for a feature this small means two sets of credentials, two
 * billing lines and two behaviours to reason about, in exchange for nothing.
 *
 * ── Haiku, because this is lookup and not reasoning ──────────────────────────
 * The question is "which of eleven screens", answered by matching a sentence
 * against a list. The heavier tier is for reading plans later; spending it here
 * would make a help feature cost more per use than the estimating it assists.
 *
 * ── The id below is NOT verified against the live gateway ────────────────────
 * It is the current Haiku-class id from Anthropic's model list. Whether this
 * particular gateway exposes it under exactly that name is a separate question,
 * and one no credential in this checkout could answer — see
 * server/navigationModel.test.ts, which asks the gateway directly and fails
 * with the real list whenever it can reach one. Until that test has run
 * somewhere with a key, treat this as the intended id rather than a confirmed
 * one, and prefer NAVIGATION_MODEL to correcting it here.
 */
export const NAVIGATION_MODEL =
  process.env.NAVIGATION_MODEL?.trim() || "claude-haiku-4-5-20251001";

/**
 * The only action the helper can take.
 *
 * A single tool with an enum parameter, which is what makes the closed set
 * real at the model layer as well as in the validation below: there is no
 * shape of output that expresses "go to /admin/delete-everything".
 */
const NAVIGATE_TOOL: Tool = {
  type: "function",
  function: {
    name: "go_to_screen",
    description:
      "Send the user to the screen that answers their question. Only call this when one screen clearly answers it.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: NAVIGATION_TARGET_IDS,
          description: "Which screen to open.",
        },
        reason: {
          type: "string",
          description:
            "One short sentence telling the user what they will find there. No preamble.",
        },
      },
      required: ["target", "reason"],
    },
  },
};

function systemPrompt(): string {
  const screens = NAVIGATION_TARGETS.map(
    t => `- ${t.id} (${t.label}): ${t.purpose}`
  ).join("\n");
  return [
    "You help a contractor find their way around an electrical estimating app.",
    "",
    "The screens available:",
    screens,
    "",
    "If one screen clearly answers the question, call go_to_screen with it.",
    "If the question is not about finding a screen, or no screen fits, reply in",
    "one or two short sentences instead of calling the tool.",
    "",
    "Be brief and concrete. This is a signpost, not a tutorial.",
  ].join("\n");
}

export type NavigationAnswer = {
  /** Prose to show. Always present. */
  message: string;
  /** Set only when a real, known screen was chosen. */
  target: { id: string; label: string; path: string } | null;
};

/** The answer while AI is switched off on this server (server/aiFeatures.ts). */
const SWITCHED_OFF: NavigationAnswer = {
  message:
    "The helper is switched off on this computer. Every screen is in the sidebar.",
  target: null,
};

const FALLBACK: NavigationAnswer = {
  message:
    "I'm not sure which screen you want. Try naming what you are trying to do — pricing a material, setting a labor rate, starting a bid.",
  target: null,
};

/**
 * Say why the helper gave up, in the server log and nowhere else.
 *
 * ── Loud in the log, silent on screen ────────────────────────────────────────
 * Every branch that returns FALLBACK comes through here, because the failure
 * this is really written for is the one that leaves no trace at all: a model id
 * the gateway does not recognise. That fails identically to having no key, and
 * from the outside both look like a helper that simply never answers — which is
 * exactly how you end up guessing at the id a second time.
 *
 * So the line always names the model it tried. The user still sees only the
 * ordinary "I'm not sure" — a missed navigation hint is not worth an error
 * banner, and the sidebar is right there.
 */
function fallbackAfter(reason: string, detail?: unknown): NavigationAnswer {
  console.warn(
    `[navigation] helper call failed: ${reason} (model: ${NAVIGATION_MODEL})`,
    detail ?? ""
  );
  return FALLBACK;
}

export const navigationRouter = router({
  ask: protectedProcedure
    .input(z.object({ question: z.string().trim().min(1).max(300) }))
    .mutation(async ({ input, ctx }): Promise<NavigationAnswer> => {
      if (!aiFeaturesEnabled()) return SWITCHED_OFF;
      let result;
      try {
        result = await invokeLLM({
          feature: "navigation",
          user: ctx.user,
          model: NAVIGATION_MODEL,
          messages: [
            { role: "system", content: systemPrompt() },
            { role: "user", content: input.question },
          ],
          tools: [NAVIGATE_TOOL],
          toolChoice: "auto",
          maxTokens: 200,
        });
      } catch (error) {
        // Running out of today's allowance is not a failure — it has its own
        // sentence, and it is the one case here the user can act on.
        if (error instanceof AiLimitReached) {
          return { message: error.message, target: null };
        }
        // The one that matters: a bad model id, a missing key and a timeout all
        // land here and are indistinguishable on screen. The message carries
        // the reason, so the log can tell them apart.
        return fallbackAfter(
          "request rejected",
          error instanceof Error ? error.message : error
        );
      }

      const choice = result.choices?.[0]?.message;
      const call = choice?.tool_calls?.[0];

      if (call?.function?.name === "go_to_screen") {
        let args: { target?: string; reason?: string } = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          // Malformed arguments are the model's problem, not the user's.
          return fallbackAfter(
            "tool arguments were not valid JSON",
            call.function.arguments
          );
        }

        // The gate. An id outside the list resolves to null and the answer
        // falls back to prose — the user is told nothing useful rather than
        // sent somewhere that does not exist.
        const target = resolveNavigationTarget(args.target);
        if (!target) {
          return fallbackAfter(
            `model named an unknown target "${args.target}"`
          );
        }

        return {
          message: args.reason?.trim() || `Opening ${target.label}.`,
          target: { id: target.id, label: target.label, path: target.path },
        };
      }

      const text =
        typeof choice?.content === "string" ? choice.content.trim() : "";
      if (text) return { message: text, target: null };

      // Reached the model, got neither a tool call nor prose. Rare, and worth
      // seeing: it usually means the tool schema and the model disagree.
      return fallbackAfter("model returned neither a tool call nor any text");
    }),
});
