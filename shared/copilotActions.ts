/**
 * Everything the plan co-pilot is allowed to do — as a checked list, not as
 * logic scattered through the router.
 *
 * ── Why a table rather than `if` statements ──────────────────────────────────
 * The guardrail this file exists to hold is "no autonomous edits": nothing the
 * co-pilot produces reaches a bid until a person says so. That rule is easy to
 * write once and easy to lose the second time, when someone adds a new capability
 * and forgets which branch enforced it. So the rule lives in DATA. Adding an
 * action is adding a row here; the enforcement in canPerform() does not change,
 * and cannot be forgotten, because there is no per-action code to forget.
 *
 * The invariant is asserted at module load, not just in a test: an action row
 * that writes without requiring confirmation stops the server from booting. A
 * test that catches it later is a test that catches it after it shipped.
 *
 * ── This is the CO-PILOT's list, and nothing else's ──────────────────────────
 * The navigation helper has its own closed set (shared/navigationTargets.ts) and
 * its own model call. The two are deliberately separate tools: merging them
 * would mean one list of permissions covering a helper that only opens screens
 * and a reader that can put quantities on a bid, and the union of two action
 * sets is always the more dangerous one.
 *
 * ── The model chooses between rows; it never constructs one ──────────────────
 * Same shape as navigationTargets: the tool schema handed to the model is built
 * from MODEL_INVOCABLE_ACTIONS below, and whatever comes back is resolved
 * against this same list before it is acted on. One list, so a prompt and a
 * validator cannot drift apart.
 */
import type { ConfidenceTier } from "./copilotConfidence";

export const COPILOT_ACTION_IDS = [
  "propose_stamp",
  "flag_for_review",
  "summarize_scope",
  "answer_question",
  "confirm_stamps",
  "record_correction",
] as const;

export type CopilotActionId = (typeof COPILOT_ACTION_IDS)[number];

export type CopilotAction = {
  id: CopilotActionId;
  /** What the user sees this called. */
  label: string;
  /** What it does, in the words a contractor would use. */
  purpose: string;
  /**
   * Does performing this change anything a bid is priced from?
   *
   * The whole safety boundary is this column. Everything false is the co-pilot
   * talking; everything true is the co-pilot's output becoming the estimate.
   */
  writes: boolean;
  /**
   * Does this put a QUANTITY on the bid?
   *
   * A narrower thing than `writes`, and the distinction is load-bearing.
   * Remembering a correction writes — but what it writes is the co-pilot's own
   * memory, and a user is entitled to tell it that an illegible smudge is
   * really a floor box. Placing a stamp writes something the estimate is
   * counted from, and that must never happen off the back of a mark nobody
   * could read. So the "no unreadable" rule attaches here rather than to
   * `writes`, which would have banned the correction that fixes the problem.
   */
  placesWork: boolean;
  /**
   * Must a person explicitly say yes to each instance first?
   *
   * Every writing action must set this. See the assertion below — this is not a
   * convention, it is checked.
   */
  requiresConfirmation: boolean;
  /**
   * May the model itself ask for this action?
   *
   * False for everything that writes. A confirmation is something a user does,
   * so it is reachable only from a tRPC procedure a click calls — it is not in
   * the tool set the model is handed at all, which is a stronger statement than
   * validating that it did not ask.
   */
  modelMayInvoke: boolean;
  /**
   * Which confidence tiers this action may be applied to.
   *
   * No action that places work accepts "unreadable" — checked below, not left
   * to care. That is the rule that keeps an illegible mark from being dressed
   * up as a low-confidence proposal: there is no path that turns one into a
   * stamp, confirmed or otherwise. The user may still CORRECT one, which is how
   * an illegible mark becomes readable work rather than a dead end.
   */
  allowedConfidence: readonly ConfidenceTier[];
};

export const COPILOT_ACTIONS: readonly CopilotAction[] = [
  {
    id: "propose_stamp",
    label: "Propose a mark",
    purpose:
      "Offer a detected symbol at a location on the sheet, for the user to accept or dismiss. Places nothing.",
    writes: false,
    placesWork: false,
    requiresConfirmation: false,
    modelMayInvoke: true,
    allowedConfidence: ["high", "low"],
  },
  {
    id: "flag_for_review",
    label: "Flag for manual review",
    purpose:
      "Say that a mark could not be read, so the user checks that spot themselves. Proposes no assembly and no count.",
    writes: false,
    placesWork: false,
    requiresConfirmation: false,
    modelMayInvoke: true,
    allowedConfidence: ["unreadable"],
  },
  {
    id: "summarize_scope",
    label: "Summarize scope of work",
    purpose:
      "Describe, in prose, what this sheet asks the user's trade to do. Read-only; changes nothing.",
    writes: false,
    placesWork: false,
    requiresConfirmation: false,
    modelMayInvoke: true,
    allowedConfidence: ["high", "low", "unreadable"],
  },
  {
    id: "answer_question",
    label: "Answer a question about the sheet",
    purpose: "Reply in prose to something the user asked about the drawing.",
    writes: false,
    placesWork: false,
    requiresConfirmation: false,
    modelMayInvoke: true,
    allowedConfidence: ["high", "low", "unreadable"],
  },
  {
    id: "confirm_stamps",
    label: "Place confirmed marks",
    purpose:
      "Drop the marks the user ticked onto the sheet, through the same mark tool a hand-placed mark uses.",
    writes: true,
    placesWork: true,
    requiresConfirmation: true,
    modelMayInvoke: false,
    allowedConfidence: ["high", "low"],
  },
  {
    id: "record_correction",
    label: "Remember a correction",
    purpose:
      "Store the user's fix — this mark is really that symbol — so the next sheet from the same drawing set reads better.",
    writes: true,
    placesWork: false,
    requiresConfirmation: true,
    modelMayInvoke: false,
    allowedConfidence: ["high", "low", "unreadable"],
  },
];

const BY_ID = new Map(COPILOT_ACTIONS.map(a => [a.id, a]));

/**
 * The guardrail, enforced at import time.
 *
 * Deliberately a throw rather than a lint or a test. A row that writes without
 * a confirmation requirement is the exact bug this file exists to prevent, and
 * the cost of catching it at boot is one failed start; the cost of catching it
 * in review is a plan reader that edits bids on its own.
 */
for (const action of COPILOT_ACTIONS) {
  if (action.writes && !action.requiresConfirmation) {
    throw new Error(
      `Co-pilot action "${action.id}" writes but does not require confirmation. ` +
        `Every writing action must be confirmed by the user first.`
    );
  }
  if (action.writes && action.modelMayInvoke) {
    throw new Error(
      `Co-pilot action "${action.id}" writes and is offered to the model. ` +
        `Writing actions are reachable only from an explicit user confirmation.`
    );
  }
  if (action.placesWork && action.allowedConfidence.includes("unreadable")) {
    throw new Error(
      `Co-pilot action "${action.id}" would put an unreadable mark on the bid. ` +
        `A mark nobody could read cannot become a quantity.`
    );
  }
  if (action.placesWork && !action.writes) {
    throw new Error(
      `Co-pilot action "${action.id}" places work but is not marked as writing.`
    );
  }
}

/** Every action the model may ask for. Used to build its tool set. */
export const MODEL_INVOCABLE_ACTIONS = COPILOT_ACTIONS.filter(
  a => a.modelMayInvoke
);

export const MODEL_INVOCABLE_ACTION_IDS = MODEL_INVOCABLE_ACTIONS.map(
  a => a.id
) as string[];

/**
 * Resolve an id the model produced, or null if it invented one.
 *
 * Null is expected traffic, not an error — same as resolveNavigationTarget.
 */
export function resolveCopilotAction(
  id: string | null | undefined
): CopilotAction | null {
  if (!id) return null;
  return BY_ID.get(id.trim() as CopilotActionId) ?? null;
}

export type PermissionRequest = {
  actionId: string;
  /** Has the user explicitly said yes to THIS instance? */
  confirmed: boolean;
  /** The tier of the finding being acted on, where one applies. */
  confidence?: ConfidenceTier;
  /** True when the request came from the model rather than from a user click. */
  fromModel?: boolean;
};

export type PermissionVerdict =
  | { allowed: true; action: CopilotAction }
  | { allowed: false; reason: string };

/**
 * The one gate. Every co-pilot action passes through here.
 *
 * Reads the table and nothing else — there is no per-action branch, which is
 * what makes "add a row" a complete way to add an action.
 */
export function canPerform(request: PermissionRequest): PermissionVerdict {
  const action = resolveCopilotAction(request.actionId);
  if (!action) {
    return {
      allowed: false,
      reason: `"${request.actionId}" is not something the plan co-pilot can do.`,
    };
  }

  if (request.fromModel && !action.modelMayInvoke) {
    return {
      allowed: false,
      reason: `${action.label} can only be started by the user, not by the model.`,
    };
  }

  if (action.requiresConfirmation && !request.confirmed) {
    return {
      allowed: false,
      reason: `${action.label} needs your confirmation before anything is written.`,
    };
  }

  if (
    request.confidence !== undefined &&
    !action.allowedConfidence.includes(request.confidence)
  ) {
    return {
      allowed: false,
      reason:
        request.confidence === "unreadable"
          ? "This mark could not be read. It needs a person to look at it — nothing will be proposed for it."
          : `${action.label} is not offered for ${request.confidence}-confidence findings.`,
    };
  }

  return { allowed: true, action };
}

/** Convenience for the common read-only check. */
export function actionWrites(id: string): boolean {
  return resolveCopilotAction(id)?.writes ?? false;
}
