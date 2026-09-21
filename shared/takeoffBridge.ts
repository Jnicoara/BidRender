/**
 * The bridge: what a counted group contributes to a bid, and what must never
 * reach it twice.
 *
 * ── The rule everything here follows ─────────────────────────────────────────
 * **The plans own what it is and how many. The bid owns what it costs.**
 *
 * A from-plans line takes its quantity and its name from the group it points
 * at, live, for as long as it points at one. Its four pricing inputs were
 * frozen when it was created and are never consulted again — R4, and the same
 * snapshot rule every other bid line follows. Anything in this module that
 * cannot be derived from that sentence is a decision nobody has made yet.
 *
 * ── Why the quantity is DERIVED and not stored ───────────────────────────────
 * `bid_line_items.qty` is a real column and a from-plans line still has one,
 * but for a linked line it is resolved from the marks before any reader sees
 * it (`resolveLineQty` below, called in `server/db.ts`). The alternative —
 * writing the count onto the line every time a mark is placed or removed — is
 * one missed write away from a bid and a drawing that disagree with nothing on
 * screen to say which is right. That is the failure `shared/takeoffCounts.ts`
 * already refuses for the counted-items panel, and money is not the place to
 * start making an exception.
 *
 * ── Why this is pure ─────────────────────────────────────────────────────────
 * No database, no framework. R3 is the rule this project has listed as Missing
 * since 2026-09-14 and has twice been described as belonging "in the CODE, not
 * only in the document". A rule that lives in a router is a rule with no test
 * that reads like the sentence it enforces; these have both.
 */

/** A counted group, as the bridge needs it. */
export type BridgeGroup = {
  id: number;
  label: string;
  kind: "plain" | "typed" | "material" | "assembly";
  /** Level 4. Null for every other level. */
  assemblyId: number | null;
  /** Level 3. Not yet a price source — see `sendability`. */
  materialId: number | null;
  /** Level 2. Not yet a price source — see `sendability`. */
  unitCost: number | null;
  /** How many marks are on the drawing. Derived, never stored. */
  count: number;
};

/** A bid line, as the bridge needs it. */
export type BridgeLine = {
  id: number;
  name: string;
  /** Set means from plans. Null means added by hand. */
  takeoffGroupId: number | null;
  /** Provenance, and the key the hand-added collision is found on. */
  assemblyId: number | null;
};

/**
 * Whether a counted group can become a bid line yet, and if not, why not.
 *
 * ── Every answer is a named reason, never a bare false ───────────────────────
 * The screen has to be able to say WHICH of these a count is in, because they
 * want opposite things from the estimator: "no price" wants a price, "already
 * on the bid" wants nothing at all, and "nothing counted" wants marks. A
 * boolean collapses three different next actions into one greyed-out control
 * that explains none of them.
 *
 * ── `unsupported-level` is a real state and is expected to shrink ────────────
 * Step one of the bridge carries level 4 only — a count made against a library
 * assembly, which already holds every one of the six numbers a line freezes.
 * Levels 2 and 3 are designed and not built (there is no price field on a count
 * anywhere in the app yet), so a typed or material group is honestly reported
 * as not supported rather than silently skipped. When step two lands, this is
 * the one function that changes, and `sendable` starts returning true for them.
 *
 * See references/plan-viewer-overhaul.md § 5f.0 OVERRIDE 1.
 */
export type Sendability =
  | { sendable: true }
  | { sendable: false; reason: "already-on-bid" }
  | { sendable: false; reason: "nothing-counted" }
  | { sendable: false; reason: "no-price" }
  | { sendable: false; reason: "unsupported-level" };

export function sendability(
  group: BridgeGroup,
  lines: readonly BridgeLine[]
): Sendability {
  if (lines.some(line => line.takeoffGroupId === group.id)) {
    return { sendable: false, reason: "already-on-bid" };
  }
  // Checked before the level, so "you have not marked anything" wins over
  // "this kind of count cannot be priced yet" — it is the nearer problem and
  // the one the estimator can act on without waiting for a feature.
  if (!(group.count > 0)) {
    return { sendable: false, reason: "nothing-counted" };
  }
  // Level 1. A plain count never reaches the bid, and that is the feature
  // rather than a limitation: a number on a drawing is worth having before
  // anybody knows what the thing costs.
  if (group.kind === "plain") {
    return { sendable: false, reason: "no-price" };
  }
  if (group.kind === "assembly") {
    // An assembly deleted from the library since the count was made. The group
    // keeps its label and its marks, but there is nothing left to price from,
    // and inventing a cost is the one thing this app never does.
    if (group.assemblyId === null) {
      return { sendable: false, reason: "no-price" };
    }
    return { sendable: true };
  }
  return { sendable: false, reason: "unsupported-level" };
}

/**
 * How many counts are priced, marked, and not yet on the bid.
 *
 * This is the number the counted-items panel and the bid's warning strip both
 * show. It counts only what the estimator could act on RIGHT NOW: a level 1
 * count is not waiting for a decision about the bid, it is waiting for a price,
 * and a level 2 count is waiting for a feature. Folding those in would produce
 * a number that does not go down when somebody does what it asks.
 */
export function countsWaitingToSend(
  groups: readonly BridgeGroup[],
  lines: readonly BridgeLine[]
): number {
  return groups.filter(group => sendability(group, lines).sendable).length;
}

/**
 * Counts that have marks but no price, and so will never reach the bid.
 *
 * The other half of the needs-attention pair, and § 5f is explicit that it
 * matters more: "14 exit signs counted, no price" is money missing from the bid
 * entirely, which is worse than a price nobody can re-check.
 *
 * LIST ONLY. Never a badge on the drawing — level 1's whole promise is a quiet
 * count, and a marker nagging toward the bid breaks that promise on the screen
 * where it was made.
 */
export function countsWithNoPrice(
  groups: readonly BridgeGroup[],
  /**
   * Required, not defaulted to empty.
   *
   * A count whose library assembly was deleted AFTER it was sent reads as
   * "no price" on its own — the link is gone, so there is nothing left to
   * price from — while being perfectly well represented on the bid already.
   * Without the lines to check against, that count would be reported as money
   * missing from a bid it is sitting on.
   */
  lines: readonly BridgeLine[]
): number {
  return groups.filter(group => {
    const result = sendability(group, lines);
    return !result.sendable && result.reason === "no-price";
  }).length;
}

/**
 * The quantity a line actually has.
 *
 * For a hand-added line, the stored number. For a from-plans line, the number
 * of marks on the drawing — which is why `counts` is keyed by group id and is
 * the same map `takeoffGroupsRouter.list` already builds.
 *
 * ── A group with no marks left resolves to 0, and the line STAYS ─────────────
 * It does not vanish and it is not skipped. Money leaving a bid because
 * somebody undid a click, with nothing on screen recording that it happened, is
 * the worse failure — and a line at 0 is findable, obviously wrong, and one
 * click from being removed, which a missing line is not.
 *
 * ── A group that is somehow absent falls back to the stored number ───────────
 * Rather than to 0. The link is protected by a RESTRICT foreign key so this
 * should be unreachable, but if it is ever reached, the last number the line
 * actually held is a better answer than silently zeroing a priced line.
 */
export function resolveLineQty(
  line: { takeoffGroupId: number | null; qty: number },
  counts: ReadonlyMap<number, number>
): number {
  if (line.takeoffGroupId === null) return line.qty;
  const counted = counts.get(line.takeoffGroupId);
  return counted === undefined ? line.qty : counted;
}

/**
 * R3, the standing half: the same assembly on the bid twice, once from the
 * plans and once added by hand.
 *
 * ── Why this is not prevented ────────────────────────────────────────────────
 * Both lines are legitimate. Six receptacles that are genuinely not on the
 * drawing is ordinary work, and refusing it would make the app wrong about the
 * job. D2(a) chose visibility here and it is the right choice: "the same
 * assembly added by hand stays a separate line marked 'added by hand', so a
 * double count is visible rather than hidden".
 *
 * ── Why a warning at send time is not enough on its own ──────────────────────
 * The hand-added line can arrive AFTER the count was sent. A check that fires
 * once, at the moment of sending, catches only the half of the cases where the
 * estimator happened to do things in that order — and misses the half where
 * they add a line to a bid that already carries a count. So this is a standing
 * check over the whole bid, read every time the bid is shown.
 *
 * Returns the assembly names involved, in first-appearance order, because a
 * warning that cannot name what it found is one nobody can act on.
 */
export function doubleCountedAssemblies(
  lines: readonly BridgeLine[]
): string[] {
  const fromPlans = new Set<number>();
  const byHand = new Set<number>();

  for (const line of lines) {
    if (line.assemblyId === null) continue;
    if (line.takeoffGroupId === null) byHand.add(line.assemblyId);
    else fromPlans.add(line.assemblyId);
  }

  const names: string[] = [];
  for (const line of lines) {
    if (line.assemblyId === null) continue;
    if (!fromPlans.has(line.assemblyId) || !byHand.has(line.assemblyId)) {
      continue;
    }
    if (!names.includes(line.name)) names.push(line.name);
  }
  return names;
}

/**
 * R3, the at-send half: what the estimator is told before a count crosses.
 *
 * Null when there is nothing to say. A sentence when this bid already carries a
 * hand-added line for the same assembly — said while somebody is looking at it,
 * which is the one moment it can be caught cheaply.
 *
 * It does not REFUSE. Sending is still what the estimator asked for and may
 * well be right; what they get is the fact, in time to change their mind.
 */
export function sendWarning(
  group: BridgeGroup,
  lines: readonly BridgeLine[]
): string | null {
  if (group.assemblyId === null) return null;
  const clash = lines.find(
    line => line.takeoffGroupId === null && line.assemblyId === group.assemblyId
  );
  if (!clash) return null;
  return (
    `This bid already has a line for ${clash.name} that was added by hand. ` +
    `Sending this count adds a second line, so check the two before you price.`
  );
}
