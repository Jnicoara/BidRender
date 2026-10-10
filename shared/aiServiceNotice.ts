/**
 * What the admin AI screen says about the server's Anthropic key, from the
 * `ai_service_status` row (0141).
 *
 * Here rather than in the component so the suite can reach it: the whole
 * point is that a dead key is SAID, and a rule about what is said with no
 * test behind it is an instruction (CLAUDE.md).
 *
 * Shown only while refusals are ongoing (`refusedSince` set). The next call
 * that works clears it on the server, so the notice cannot outlive the fault.
 */

export type AiServiceStatusView = {
  refusedSince: Date | string | null;
  lastRefusedAt: Date | string | null;
  lastRefusalReason: string | null;
};

export type AiRefusalNotice = {
  /** When the run of refusals started. */
  since: Date;
  /** One sentence: what is wrong and where the fix is written down. */
  message: string;
};

export function aiRefusalNotice(
  status: AiServiceStatusView | null
): AiRefusalNotice | null {
  if (!status?.refusedSince) return null;
  const since = new Date(status.refusedSince);
  const message =
    status.lastRefusalReason === "no-key"
      ? "This server has no Anthropic key (ANTHROPIC_API_KEY), so every AI feature says it is unavailable. Set it in the app's settings — references/deploying.md § 8a."
      : "Anthropic is refusing this server's key — it may have expired or been disabled — so every AI feature says it is unavailable. Swap in a new key — references/deploying.md § 8a.";
  return { since, message };
}
