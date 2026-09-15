/**
 * One switch for every AI feature: the "where do I…?" helper, material alias
 * suggestions and the plan reader.
 *
 * ── Why a switch when each already degrades ──────────────────────────────────
 * Each feature copes with an unreachable model, but coping still means a
 * request that fails, a warning in the log and — for the plan reader — a failed
 * run stored against every sheet that is opened, because the Takeoff screen
 * reads a sheet on its own when it opens. Off is quieter than broken: nothing
 * is attempted, nothing is stored, and the reader's panel is not offered.
 *
 * DISABLE_AI_FEATURES=true turns it off. Read at call time, not import time.
 */
export function aiFeaturesEnabled(): boolean {
  return process.env.DISABLE_AI_FEATURES !== "true";
}

/** Feature ids (shared/permissions.ts) withheld from the client while off. */
export const AI_FEATURE_IDS = ["takeoff.copilot"] as const;
