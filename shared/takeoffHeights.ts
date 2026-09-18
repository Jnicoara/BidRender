/**
 * Mounting heights, and the vertical footage they produce.
 *
 * ── What this module exists for ──────────────────────────────────────────────
 * Tracing a plan measures FLAT OVERHEAD DISTANCE ONLY. The drawing does not
 * know the pipe runs at 10 ft or that the receptacle sits at 18 inches, so
 * every drop and every rise is invisible to a traced line. Thirty receptacles
 * dropped from a 10 ft distribution height is 255 ft of conduit and the same
 * again in wire per conductor, none of which appears in any traced length.
 * See `references/plan-viewer-overhaul.md` § 2.4 and § 5d.
 *
 * ── Nothing here guesses, and the gate is one number ─────────────────────────
 * A vertical is the distance between two elevations. Until the DISTRIBUTION
 * HEIGHT — the elevation the raceway actually runs at — is set, only one of
 * those two is ever known, so every function here refuses rather than
 * inventing the other. That refusal is the whole safety property: no footage
 * can appear in a bid that nobody asked for.
 *
 * Refusals are NAMED, not blank. "Nobody said what is at this end" and "the
 * height for this device has never been set" are different situations with
 * different fixes, and a caller that cannot tell them apart can only print a
 * zero — which reads on screen exactly like a considered answer.
 *
 * ── Inches in, feet out ──────────────────────────────────────────────────────
 * Elevations are stored and passed as INCHES, because 18" typed as `1.5` is
 * the obvious mistake to design out and `formatFeetInches` already exists to
 * display them. Footage comes back in decimal feet, through the same
 * `toBillableFeet` every traced length goes through, so a vertical foot and a
 * traced foot are rounded identically.
 *
 * ── Below the floor is a negative elevation ──────────────────────────────────
 * A floor box is 0", an underground stub-up is negative. The arithmetic does
 * not care which way round the two elevations are — the vertical is the
 * distance between them — but the TYPING does: `18` meant as a stub-up below
 * slab reads as eighteen inches above it, and the error is eleven and a half
 * feet on every one. So a type flagged `belowFloor` is entered as a positive
 * depth at the UI boundary and stored negative here. Nothing downstream has to
 * know.
 */
import { toBillableFeet } from "./takeoffGeometry";

/**
 * The end of a run that carries on at run height — a pipe passing through,
 * rather than dropping to anything.
 *
 * It is a KIND rather than the absence of one, and that distinction is a
 * safeguard: "continues at run height" is an answer, "nobody said" is not, and
 * collapsing them would hide unanswered runs among deliberate ones.
 */
export const DISTRIBUTION_KIND = "distribution";

/** One entry in the shipped height list. */
export type ShippedHeightType = {
  /** Stable forever. A run points at this, so it must survive a rename. */
  key: string;
  label: string;
  /**
   * Inches from the finished floor, or NULL to ship UNSET.
   *
   * NULL is not zero. Zero is a real height — a floor box is at zero — so a
   * type nobody has set has to be a different value from one set to the floor.
   */
  startingInches: number | null;
  /** Above the fold on the heights screen. See CLAUDE.md § Customization. */
  common: boolean;
  /** Entered as a positive depth below the floor; stored negative. */
  belowFloor?: boolean;
  /**
   * Shown beside the value. A CONVENTION and a GUESS are different claims and
   * the screen has to say which one it is making.
   */
  note?: string;
};

/**
 * The height types that ship with the app.
 *
 * ── These are conventions, dated, never facts ────────────────────────────────
 * Every number here is a common convention rather than a measurement from
 * anyone's jobs, and the UI says so beside each one — the same treatment a
 * starter material price gets. See `CLAUDE.md` § Starter content.
 *
 * ── Two of them ship UNSET on purpose ────────────────────────────────────────
 * A PANEL is fed top, bottom or back depending on how the can is set, and a
 * surface-mounted panel with pipe entering the top may drop a foot from
 * ceiling height or nothing at all. A shipped value would have added invented
 * footage to the end of EVERY HOMERUN ON EVERY JOB — the largest single number
 * in this feature, and wrong. A CEILING BOX is the same argument: often at
 * distribution height, often not.
 *
 * This list is the app-owned half of `takeoff_mounting_heights`. A company's
 * own rows override these by key and their own types are added alongside —
 * same table, same read, separated only by whether the row has an owner. See
 * § 5d, and `seedBaselineMaterials` for the pattern this copies.
 */
export const SHIPPED_HEIGHT_TYPES: readonly ShippedHeightType[] = [
  {
    key: "receptacle",
    label: "Receptacle",
    startingInches: 18,
    common: true,
    note: "Convention",
  },
  {
    key: "switch",
    label: "Switch",
    startingInches: 48,
    common: true,
    note: "Convention, and the reach limit is why",
  },
  {
    key: "panel",
    label: "Panel",
    startingInches: null,
    common: true,
    note: "Varies with how the can is set — set yours",
  },
  {
    key: "ceiling-box",
    label: "Ceiling box / fixture",
    startingInches: null,
    common: true,
    note: "Often at run height, often not — set yours",
  },
  {
    key: "junction-box-wall",
    label: "Junction box, wall",
    startingInches: 96,
    common: true,
    note: "A guess, not a convention",
  },
  {
    key: "disconnect",
    label: "Disconnect / equipment",
    startingInches: 60,
    common: true,
    note: "Mounted for a reachable handle",
  },
  {
    key: "floor-box",
    label: "Floor box",
    startingInches: 0,
    common: false,
    note: "Convention",
  },
  {
    key: "underground",
    label: "Underground / slab",
    startingInches: -18,
    common: false,
    belowFloor: true,
    note: "Convention, measured below the floor",
  },
] as const;

/** The shipped heights by key, for the resolver's last layer. */
const SHIPPED_BY_KEY: ReadonlyMap<string, number | null> = new Map(
  SHIPPED_HEIGHT_TYPES.map(type => [type.key, type.startingInches])
);

/** Whether a key names a shipped type at all. */
export function shippedHeightType(key: string): ShippedHeightType | null {
  return SHIPPED_HEIGHT_TYPES.find(type => type.key === key) ?? null;
}

/**
 * Where the number in effect came from.
 *
 * `unset` and a null height always agree — see `resolveMountingHeight`. One
 * state, so the two cannot drift into disagreeing about whether something has
 * been set.
 */
export type HeightSource = "run" | "job" | "company" | "shipped" | "unset";

export type ResolvedHeight = {
  /** Inches from the finished floor. NULL means nothing anywhere set it. */
  inches: number | null;
  source: HeightSource;
};

/**
 * The company's and the job's own heights, by type key.
 *
 * A key PRESENT in a map is an override at that level. Absent means "ask the
 * level above" — never "set to nothing". This is the inheritance rule from
 * `CLAUDE.md` § Company defaults, one level deeper: nothing is copied down, so
 * changing a company height re-prices every run still inheriting it.
 */
export type HeightLayers = {
  company: ReadonlyMap<string, number>;
  job: ReadonlyMap<string, number>;
};

const NO_LAYERS: HeightLayers = { company: new Map(), job: new Map() };

/**
 * The mounting height in effect for one type: run → job → company → shipped.
 *
 * An unknown key resolves to unset rather than throwing. A type can be retired
 * after runs already point at it, and a run that outlives its type has to keep
 * reading as "not set" — not crash the screen it is on, and not silently
 * borrow some other type's number.
 */
export function resolveMountingHeight(
  key: string | null,
  layers: HeightLayers = NO_LAYERS,
  runOverrideInches: number | null = null
): ResolvedHeight {
  if (usableInches(runOverrideInches))
    return { inches: runOverrideInches, source: "run" };
  if (key === null) return UNSET;

  const job = layers.job.get(key);
  if (usableInches(job)) return { inches: job, source: "job" };

  const company = layers.company.get(key);
  if (usableInches(company)) return { inches: company, source: "company" };

  const shipped = SHIPPED_BY_KEY.get(key);
  if (usableInches(shipped)) return { inches: shipped, source: "shipped" };

  return UNSET;
}

/**
 * The distribution height in effect: run → job → company.
 *
 * There is no shipped layer, and that absence is the gate the whole feature
 * hangs on. Until somebody enters this number, no vertical is counted anywhere
 * — see the module header.
 */
export function resolveDistributionHeight(levels: {
  company?: number | null;
  job?: number | null;
  run?: number | null;
}): ResolvedHeight {
  if (usableInches(levels.run)) return { inches: levels.run, source: "run" };
  if (usableInches(levels.job)) return { inches: levels.job, source: "job" };
  if (usableInches(levels.company))
    return { inches: levels.company, source: "company" };
  return UNSET;
}

const UNSET: ResolvedHeight = { inches: null, source: "unset" };

/** An elevation the arithmetic can use. Zero and negatives are both real. */
function usableInches(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Why no vertical was counted at an end. Four different situations, four
 * different fixes, and the screen says which one it is looking at.
 *
 *   no-kind                nobody has said what is at this end
 *   no-distribution-height the gate is shut; nothing is counted anywhere yet
 *   height-not-set         this type has no height at any level (a panel)
 *   level                  it sits at run height — the pipe carries straight on
 */
export type VerticalRefusal =
  | "no-kind"
  | "no-distribution-height"
  | "height-not-set"
  | "level";

export type EndVertical =
  | { counted: false; kind: string | null; reason: VerticalRefusal }
  | {
      counted: true;
      kind: string;
      /** Which way the pipe goes. Footage is the same either way. */
      direction: "rise" | "drop";
      distributionInches: number;
      endInches: number;
      feet: number;
    };

/**
 * The vertical at ONE end of a run.
 *
 * Takes elevations already resolved through the four levels, rather than the
 * layers themselves, so the arithmetic can be tested without a settings tree
 * and so there is exactly one place that decides which level wins.
 *
 * `level` is returned rather than a counted zero. A zero on screen reads as a
 * considered answer and would put "Drop at end 0.00 ft" under every run that
 * carries straight on, which is noise standing where a real number goes.
 */
export function verticalAtEnd(end: {
  kind: string | null;
  endInches: number | null;
  distributionInches: number | null;
}): EndVertical {
  const { kind } = end;
  if (kind === null) return { counted: false, kind: null, reason: "no-kind" };
  if (!usableInches(end.distributionInches))
    return { counted: false, kind, reason: "no-distribution-height" };
  if (kind === DISTRIBUTION_KIND)
    return { counted: false, kind, reason: "level" };
  if (!usableInches(end.endInches))
    return { counted: false, kind, reason: "height-not-set" };

  const distributionInches = end.distributionInches;
  const endInches = end.endInches;
  const difference = distributionInches - endInches;
  if (difference === 0) return { counted: false, kind, reason: "level" };

  return {
    counted: true,
    kind,
    direction: difference > 0 ? "drop" : "rise",
    distributionInches,
    endInches,
    // Through the same function every traced length goes through, so a
    // vertical foot and a traced foot round identically.
    feet: toBillableFeet(Math.abs(difference)),
  };
}

export type RunVerticals = {
  start: EndVertical;
  end: EndVertical;
  /**
   * Both ends, once each. This is the CONDUIT side: a drop is one length of
   * pipe however many conductors go down it.
   */
  feet: number;
};

/** Both ends of a run, and what they come to. */
export function verticalsForRun(
  start: Parameters<typeof verticalAtEnd>[0],
  end: Parameters<typeof verticalAtEnd>[0]
): RunVerticals {
  const startVertical = verticalAtEnd(start);
  const endVertical = verticalAtEnd(end);
  const feet =
    (startVertical.counted ? startVertical.feet : 0) +
    (endVertical.counted ? endVertical.feet : 0);
  return {
    start: startVertical,
    end: endVertical,
    feet: round2(feet),
  };
}

// ── The double-count rule ────────────────────────────────────────────────────
/**
 * A VERTICAL BELONGS TO EITHER THE RUN OR THE STAMP, NEVER BOTH.
 *
 * If a run's end drop is counted and the receptacle stamped at that same point
 * also carries its own drop, the footage is counted twice and nothing on
 * screen catches it — the total is simply larger, and larger is exactly what
 * an estimator expects verticals to make it.
 *
 * ── Why the rule is here and not in two places ───────────────────────────────
 * The obvious shape is a check in the run total and another in the stamp
 * total. A rule enforced in two places survives until somebody edits one of
 * them. So run and stamp footage are added up in ONE function, which cannot
 * add a claimed stamp because it decides ownership before it sums anything.
 *
 * ── Ownership is claimed, never inferred from distance ───────────────────────
 * A run owns a stamp because the estimator linked them — the one-tap
 * suggestion when a run finishes on a stamp (§ 5c). Deciding it by proximity
 * would be the guessing § 2.4 refuses: right most of the time, and silently
 * wrong the rest, with nothing on screen looking wrong. An UNLINKED stamp
 * sitting on a run end is therefore a possible double count, and it gets
 * FLAGGED where it can be seen rather than quietly resolved.
 */
export type RunVerticalClaim = {
  /** This run's own vertical footage, both ends. */
  verticalFeet: number;
  startStampId: number | null;
  endStampId: number | null;
};

/** One stamp's own vertical footage, for a device not on a traced run. */
export type StampVertical = { stampId: number; verticalFeet: number };

/** Every stamp id claimed by a run end. */
export function stampsClaimedByRuns(
  runs: readonly Pick<RunVerticalClaim, "startStampId" | "endStampId">[]
): Set<number> {
  const claimed = new Set<number>();
  for (const run of runs) {
    if (run.startStampId !== null) claimed.add(run.startStampId);
    if (run.endStampId !== null) claimed.add(run.endStampId);
  }
  return claimed;
}

/**
 * Total vertical footage for a bid, with every drop counted exactly once.
 *
 * The one place run verticals and stamp verticals are added together, and the
 * only place allowed to do it.
 */
export function totalVerticalFeet(input: {
  runs: readonly RunVerticalClaim[];
  stamps: readonly StampVertical[];
}): {
  runFeet: number;
  stampFeet: number;
  totalFeet: number;
  /** Stamps whose vertical a run already carries. Not an error — the rule. */
  ownedByRuns: number[];
} {
  const claimed = stampsClaimedByRuns(input.runs);

  let runFeet = 0;
  for (const run of input.runs) {
    if (Number.isFinite(run.verticalFeet)) runFeet += run.verticalFeet;
  }

  let stampFeet = 0;
  const ownedByRuns: number[] = [];
  for (const stamp of input.stamps) {
    if (claimed.has(stamp.stampId)) {
      ownedByRuns.push(stamp.stampId);
      continue;
    }
    if (Number.isFinite(stamp.verticalFeet)) stampFeet += stamp.verticalFeet;
  }

  return {
    runFeet: round2(runFeet),
    stampFeet: round2(stampFeet),
    totalFeet: round2(runFeet + stampFeet),
    ownedByRuns,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
