/**
 * BRANCH LEGS — how the rows of one run join up (D20 in
 * `references/takeoff-spec.md`, § 5k of `plan-viewer-overhaul.md`).
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 * A run is a ROOT row plus any number of LEG rows in `takeoff_runs`, each leg
 * pointing at the root through `parentRunId`. Every row is one continuous
 * length of pipe between two nodes, which is exactly the "leg" that
 * `runFittings.ts` and `runBends.ts` already count — so neither needed a rule
 * of its own for branches.
 *
 * A TEE is where a branch leaves: a stored row in `takeoff_run_tees`. Creating
 * one CUTS the leg it lands on into two rows (`addLeg` in the runs router), so
 * three leg ends meet at the tee and nothing has to split a leg at read time.
 *
 * ── Joined only by an explicit tee, never by nearness ────────────────────────
 * Two leg ends drawn at the same spot are two line ends unless a tee row joins
 * them. The same rule `runFittings.ts` states for stamps, and it is what makes
 * a hand trace and an AI trace count the same: the structure is in the rows,
 * not in how close two clicks happened to land.
 *
 * ── Geometry in, never the tool ──────────────────────────────────────────────
 * Nothing here knows how a leg was drawn, and nothing depends on the ORDER the
 * rows arrive in — `server/runNetwork.test.ts` shuffles them to prove it.
 */
import type { FittingCount, FittingLeg } from "./runFittings";
import { TRADE_SIZE_ORDER } from "./materialSizeOrder";
import { DISTRIBUTION_KIND } from "./takeoffHeights";

/**
 * What stands at a split.
 *
 *   box   a junction box and its blank cover, sized to the pipe (`teeBoxFor`)
 *   body  a T conduit body — RESERVED: the catalog ships none yet (todo.md),
 *         so nothing offers it and a stored one counts as unanswered
 *   mark  a box that is already on the drawing as a counted mark; nothing new
 *         is bought, and the tee joins that mark's node
 *
 * NULL is unanswered, which only a proposal (the AI path) can produce: the
 * hand path always sends the sticky toolbar choice.
 */
export const TEE_FITTINGS = ["box", "body", "mark"] as const;
export type TeeFitting = (typeof TEE_FITTINGS)[number];

export function isTeeFitting(value: unknown): value is TeeFitting {
  return (TEE_FITTINGS as readonly unknown[]).includes(value);
}

/** A tee as the counting needs it. */
export type TeeRef = {
  id: number;
  fitting: TeeFitting | null;
  /** The mark it stands on, when `fitting` is "mark". */
  stampId: number | null;
};

/** Node key prefix for a tee. `runFittings.ts` words these as tees. */
export const TEE_NODE = "tee:";

/**
 * The node an end of a leg sits on.
 *
 * A TEE wins over the leg's own stamp link. A tee on a mark IS that mark's
 * node, so a run linked to the same mark from elsewhere meets it there; any
 * other tee is a node of its own. An end with neither is a line end.
 */
export function endNodeKey(
  rowId: number,
  end: "start" | "end",
  stampId: number | null,
  tee: TeeRef | null
): string {
  if (tee) {
    if (tee.fitting === "mark" && tee.stampId !== null)
      return `stamp:${tee.stampId}`;
    return `${TEE_NODE}${tee.id}`;
  }
  if (stampId !== null) return `stamp:${stampId}`;
  return `run:${rowId}:${end}`;
}

// ── Cutting a leg at a tee ───────────────────────────────────────────────────

type Pt = { x: number; y: number };

/** Two page points closer than this are the same point (a decimal column). */
export const SAME_PAGE_POINT = 0.01;

/**
 * The nearest point ON a path to `p`: which segment, and where along it.
 * NULL for a path with fewer than two points.
 */
export function projectOntoPath(
  points: readonly Pt[],
  p: Pt
): { segment: number; point: Pt; distance: number } | null {
  let best: { segment: number; point: Pt; distance: number } | null = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)
          );
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    const distance = Math.hypot(p.x - point.x, p.y - point.y);
    if (!best || distance < best.distance)
      best = { segment: i, point, distance };
  }
  return best;
}

/**
 * Cut a path in two at the point on it nearest `at`.
 *
 * The cut point ends the first piece and starts the second, so the two share
 * it exactly and together cover the path with nothing added or lost. A cut
 * on an existing vertex reuses it — which is what makes a corner at a tee
 * vanish as a bend: the box turns the pipe, so neither piece has a corner
 * there (D20). NULL when the nearest point is an END of the path: a branch
 * from an end is not a tee, it is a leg starting at that end.
 */
export function cutPathAt(
  points: readonly Pt[],
  at: Pt,
  /**
   * How close (page points) to a vertex counts as ON it. The screen passes
   * its snap radius, so a click that visibly lands on a corner cuts at the
   * corner rather than a hair beside it — a hair beside it would leave a
   * corner on one piece and count an elbow the box already makes.
   */
  vertexTolerance = SAME_PAGE_POINT
): { before: Pt[]; after: Pt[]; point: Pt } | null {
  const hit = projectOntoPath(points, at);
  if (!hit) return null;
  const same = (a: Pt, b: Pt) =>
    Math.hypot(a.x - b.x, a.y - b.y) <=
    Math.max(vertexTolerance, SAME_PAGE_POINT);
  const n = points.length;
  if (same(hit.point, points[0]) || same(hit.point, points[n - 1])) return null;

  // On a vertex: cut there, sharing it.
  for (let i = 1; i < n - 1; i++) {
    if (same(hit.point, points[i])) {
      return {
        before: points.slice(0, i + 1).map(copy),
        after: points.slice(i).map(copy),
        point: copy(points[i]),
      };
    }
  }
  // Along a segment: a new vertex on both pieces.
  const k = hit.segment;
  return {
    before: [...points.slice(0, k + 1).map(copy), copy(hit.point)],
    after: [copy(hit.point), ...points.slice(k + 1).map(copy)],
    point: copy(hit.point),
  };
}

function copy(p: Pt): Pt {
  return { x: p.x, y: p.y };
}

// ── A tee end has no vertical and is not a device ────────────────────────────

/**
 * An end's kind as heights and wire ownership must read it.
 *
 * A branch leaves the main at the main's own elevation — same pipe, same
 * height — so a tee end is "carries straight on at run height": no drop, and
 * never a device end. Read any other way, every branch would count a phantom
 * drop at the split, which is the double count § 5d names.
 *
 * Applied INSIDE `verticalsForRunRow` and `runWireOwnership`, both of which
 * require the tee id in their input, so a new caller cannot read a tee end's
 * stored kind by leaving the id out. The stored kind is not touched: the
 * server refuses to set one on a tee end, and if a tee is deleted the end
 * goes back to whatever it says.
 */
export function kindAtEnd(
  kind: string | null | undefined,
  teeId: number | null | undefined
): string | null {
  if (teeId !== null && teeId !== undefined) return DISTRIBUTION_KIND;
  return kind ?? null;
}

/** An end's own height override, which a tee end never has. */
export function heightAtEnd(
  inches: number | null,
  teeId: number | null | undefined
): number | null {
  return teeId !== null && teeId !== undefined ? null : inches;
}

/** The root a row belongs to. */
export function rootOf(row: { id: number; parentRunId: number | null }) {
  return row.parentRunId ?? row.id;
}

/**
 * Which run type BUYS the box at each tee.
 *
 * Legs of different sizes are counted in different groups, so a tee between a
 * 3/4" main and a 1/2" branch appears in both. Counting its box in each would
 * buy two boxes for one split. So one group owns it: the LARGEST raceway
 * meeting there (the box is sized to it), ties to the lowest leg id — a rule
 * that depends only on what meets at the tee, never on the order rows arrive.
 *
 * Returns tee id → owning run type id. A size that cannot be read ranks below
 * every size that can.
 */
export function teeBoxOwners(
  groups: ReadonlyMap<number, readonly FittingLeg[]>,
  sizeOf: (runTypeId: number) => string | null
): Map<number, number> {
  // Ranked through the trade-size table, never arithmetic on the text
  // (CLAUDE.md § sort order). -1 is "cannot be read", below every real size.
  type Candidate = { typeId: number; rank: number; legId: number };
  const best = new Map<number, Candidate>();
  const better = (a: Candidate, b: Candidate): boolean =>
    a.rank !== b.rank ? a.rank > b.rank : a.legId < b.legId;
  groups.forEach((legs, typeId) => {
    const size = sizeOf(typeId);
    const rank =
      size === null
        ? -1
        : (TRADE_SIZE_ORDER as readonly string[]).indexOf(size);
    for (const leg of legs) {
      for (const node of [leg.from, leg.to]) {
        if (!node.startsWith(TEE_NODE)) continue;
        const teeId = Number(node.slice(TEE_NODE.length));
        const candidate = { typeId, rank, legId: Number(leg.id) };
        const current = best.get(teeId);
        if (!current || better(candidate, current)) best.set(teeId, candidate);
      }
    }
  });
  const owners = new Map<number, number>();
  best.forEach((c, teeId) => owners.set(teeId, c.typeId));
  return owners;
}

/** The two parts a tee box sends. Appended to `FITTING_KINDS`. */
export const TEE_KINDS = ["teeBox", "teeCover"] as const;
export type TeeKind = (typeof TEE_KINDS)[number];

export function isTeeRole(role: string | null | undefined): role is TeeKind {
  return (TEE_KINDS as readonly unknown[]).includes(role);
}

/**
 * The tee box and cover counts for the tees one run type owns, each with the
 * sentence that says how it was worked out.
 *
 * An unanswered tee makes the box count "at least": the split is real and
 * something stands there, but nobody has said what, so nothing is bought
 * for it silently.
 */
export function teeFittingCounts(
  owned: readonly TeeRef[],
  coverIncluded: boolean
): { teeBox: FittingCount; teeCover: FittingCount } {
  if (owned.length === 0) {
    const none = (kind: TeeKind): FittingCount => ({
      kind,
      status: "counted",
      qty: 0,
      atLeast: false,
      why: "No branch tees",
    });
    return { teeBox: none("teeBox"), teeCover: none("teeCover") };
  }
  const { boxes, onMarks, unanswered } = countTeeBoxes(owned);
  const notes: string[] = [];
  if (onMarks > 0)
    notes.push(
      `${onMarks} ${onMarks === 1 ? "tee is" : "tees are"} on a mark already counted`
    );
  if (unanswered > 0)
    notes.push(
      `${unanswered} ${unanswered === 1 ? "tee has" : "tees have"} no box chosen — not counted`
    );
  const tail = notes.length > 0 ? ` (${notes.join("; ")})` : "";
  const atLeast = unanswered > 0;
  const lead = atLeast ? "At least " : "";
  const teeBox: FittingCount = {
    kind: "teeBox",
    status: "counted",
    qty: boxes,
    atLeast,
    why: `${lead}${boxes} ${boxes === 1 ? "tee box" : "tee boxes"}: one at each branch tee${tail}`,
  };
  const teeCover: FittingCount = coverIncluded
    ? {
        kind: "teeCover",
        status: "included",
        why: "The pull box at a tee comes with its cover",
      }
    : {
        kind: "teeCover",
        status: "counted",
        qty: boxes,
        atLeast,
        why: `${lead}${boxes} blank ${boxes === 1 ? "cover" : "covers"}: one on each tee box${tail}`,
      };
  return { teeBox, teeCover };
}

/**
 * The tee boxes one run type buys, from the tees it owns.
 *
 * A tee on a MARK buys nothing — the box is already counted as that mark. An
 * unanswered tee (or a T body, which the catalog cannot supply yet) is not
 * counted and says so: never a quiet box nobody chose, never a quiet zero.
 */
export function countTeeBoxes(owned: readonly TeeRef[]): {
  boxes: number;
  onMarks: number;
  unanswered: number;
} {
  let boxes = 0;
  let onMarks = 0;
  let unanswered = 0;
  for (const tee of owned) {
    if (tee.fitting === "box") boxes++;
    else if (tee.fitting === "mark") onMarks++;
    else unanswered++;
  }
  return { boxes, onMarks, unanswered };
}
