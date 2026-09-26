/**
 * WHAT SEND-AGAIN DOES TO A RUN-TYPE LINE ALREADY ON THE BID.
 *
 * Decided by the owner, 2026-09-26, and written here as ONE function so the
 * Send preview and the send itself cannot disagree:
 *
 *   1. REFILL — a line that reads "Not priced" takes the material's CURRENT
 *      price. A price that is already set is never overwritten.
 *   2. SWAP — a fitting line whose type now names a different part (the
 *      fitting STYLE changed, or an override) becomes the current part on
 *      Send-again, and the preview says so: "set-screw coupling → compression
 *      coupling, 9". Changing the style alone moves nothing; only Send does.
 *   3. A LOCKED bid is never touched — the caller refuses before asking.
 *
 * A swap is a different PART, so it takes that part's price, hours and
 * markup — the line is re-snapshotted as if sent fresh. That is the point of
 * the swap, and why the preview names it before anybody presses Send.
 *
 * Only these. Quantity is refreshed by the caller as it always was, and
 * nothing here re-prices a line whose price somebody already has — R4, the
 * snapshot freeze, holds for every priced line.
 */
import { needsPricing } from "./materialPricing";

/** A part as this needs it: an identity that survives forks, and a price. */
export type ResendPart = {
  /** `materialItemKey` — the baseline id for a shipped row or its fork. */
  key: number;
  name: string;
  costPerUnit: string | number;
};

export type ResendPlan =
  | { kind: "keep" }
  | { kind: "refill"; price: number }
  | { kind: "swap"; from: string; to: string };

export function resendPlan(input: {
  /** Fitting roles swap; pipe and wire never do (only the style decision). */
  isFitting: boolean;
  /**
   * What the line holds. NULL when nobody can say (sent before 0083 and not
   * recoverable). For a fitting that means "leave its part alone"; for pipe
   * or wire the part is the type's own link, so it is the current one.
   */
  linePart: ResendPart | null;
  /** What the type names today, or null when it names nothing. */
  currentPart: ResendPart | null;
  /** The line's frozen material cost. */
  lineCost: string | number | null;
}): ResendPlan {
  const { isFitting, currentPart } = input;
  if (currentPart === null) return { kind: "keep" };

  const linePart = input.linePart ?? (isFitting ? null : currentPart);
  if (linePart === null) return { kind: "keep" };

  if (isFitting && linePart.key !== currentPart.key) {
    return { kind: "swap", from: linePart.name, to: currentPart.name };
  }
  if (
    linePart.key === currentPart.key &&
    needsPricing(input.lineCost) &&
    !needsPricing(currentPart.costPerUnit)
  ) {
    return { kind: "refill", price: Number(currentPart.costPerUnit) };
  }
  return { kind: "keep" };
}

/**
 * "set-screw coupling → compression coupling, 9" — the two names with the
 * words they share at the front dropped, so the change is what reads.
 */
export function swapText(from: string, to: string, qty: number): string {
  const a = from.split(" ");
  const b = to.split(" ");
  let shared = 0;
  while (
    shared < a.length - 1 &&
    shared < b.length - 1 &&
    a[shared] === b[shared]
  ) {
    shared++;
  }
  return `${a.slice(shared).join(" ")} → ${b.slice(shared).join(" ")}, ${qty}`;
}
