/**
 * Turning stamps and traced runs into one list an estimator can read.
 *
 * ── Why counts are derived, never stored ─────────────────────────────────────
 * A stamp is one row per drop, so the quantity of an assembly is simply how
 * many rows there are. Storing a count alongside would give two sources of
 * truth for the same fact, and the moment a stamp is deleted from the drawing
 * without the count following, the list and the plan disagree — with nothing on
 * screen to say which is right. Counting here means they cannot diverge.
 *
 * ── One list, two kinds of thing ─────────────────────────────────────────────
 * Stamps are counted (12 receptacles) and runs are measured (30 ft of conduit).
 * They are genuinely different quantities and are kept as distinct entry types
 * rather than flattened into a single "amount" column, because a number without
 * its unit is how a footage ends up being ordered as a piece count.
 *
 * Both carry a location, which is what lets clicking a list row jump the viewer
 * to the mark on the drawing.
 */
import { heightTypeLabel } from "./takeoffHeights";
import type { PagePoint } from "./takeoffGeometry";

/**
 * A stamp as the counter needs it.
 *
 * ── `name` is resolved before it gets here ───────────────────────────────────
 * From phase 6 a mark carries position and a pointer to its group; what it is
 * CALLED belongs to the group. The database layer resolves the two into one
 * string (`stampName` below) so this module stays a pure function over records
 * and never has to know that a label has two possible homes.
 */
export type StampRecord = {
  id: number;
  sheetId: number;
  /** The group this mark belongs to. Null only on pre-phase-6 rows. */
  groupId: number | null;
  /** The group's label, or the pre-phase-6 assembly snapshot. Never empty. */
  name: string;
  /** Provenance, still used to key pre-phase-6 marks. Null for a plain count. */
  assemblyId: number | null;
  /**
   * The assembly's category at drop time, or null.
   *
   * Carried here only so the PANEL can draw the same shape as the drawing:
   * an assembly-backed count takes its shape from its category, and a swatch
   * computed without one would quietly show a different shape from the marks
   * it is the legend for. See shared/takeoffMarks.ts.
   */
  assemblyCategory?: string | null;
  x: number;
  y: number;
};

/**
 * What to call a mark, in the order the answer should be trusted.
 *
 * The group first, because it is the live fact and the only one a rename
 * updates. The stamp's snapshot second, for rows written before groups existed.
 * A placeholder last, so a row that somehow has neither shows as something a
 * person can click rather than as an empty line in the count.
 */
export function stampName(stamp: {
  groupLabel?: string | null;
  assemblyName?: string | null;
}): string {
  const label = stamp.groupLabel?.trim();
  if (label) return label;
  const snapshot = stamp.assemblyName?.trim();
  if (snapshot) return snapshot;
  return "Unnamed count";
}

/**
 * What to call a traced run, in the order the answer should be trusted.
 *
 * The type's LIVE label first, because that is the fact a rename updates and
 * the reason a run follows its type at all. The snapshot taken when it was
 * traced second, for a run whose type has been deleted. The run's own name
 * last, for everything traced before the palette existed.
 *
 * Exactly the shape of `stampName` above, deliberately: a mark and a run are
 * the same problem — a thing on a drawing whose name lives somewhere else —
 * and two different resolution orders would be two ways to disagree.
 */
export function runName(run: {
  runTypeLiveLabel?: string | null;
  runTypeLabel?: string | null;
  name?: string | null;
}): string {
  const live = run.runTypeLiveLabel?.trim();
  if (live) return live;
  const snapshot = run.runTypeLabel?.trim();
  if (snapshot) return snapshot;
  const own = run.name?.trim();
  if (own) return own;
  return "Untyped run";
}

/**
 * What a run type is MADE OF, in one short line.
 *
 * ── Why this is shared rather than written at each surface ───────────────────
 * The same argument `runNameParts` makes below: the palette, the run row and
 * anything that exports a takeoff all have to say the same thing about the same
 * type, and two implementations of "what is this made of" is two chances to
 * disagree in the one place an estimator is checking what they are buying.
 *
 * ── Null means "nothing has been said yet", and it has to stay distinct ──────
 * Not an empty string, and never a hopeful "EMT". A type with no materials
 * behind it is a real and supported state — it still names its runs and still
 * groups them — and the palette already says so in words. Returning something
 * that looks like a specification would be the whisper `§ 2.3` of the overhaul
 * document warns about, in the field that decides what gets bought.
 *
 * A CABLE type has no raceway by design: the cable IS the raceway, and the
 * conductor link holds it (drizzle/schema.ts on `takeoff_run_types`). So a
 * cable reads as its own name alone rather than as a pipe it does not have.
 */
export function runTypeSpec(type: {
  pathType?: "conduit" | "cable" | null;
  racewayMaterialName?: string | null;
  conductorMaterialName?: string | null;
  conductorCount?: number | null;
  groundMaterialName?: string | null;
  groundCount?: number | null;
}): string | null {
  const raceway = type.racewayMaterialName?.trim() || null;
  const conductor = type.conductorMaterialName?.trim() || null;
  const groundWire = type.groundMaterialName?.trim() || null;
  if (!raceway && !conductor) return null;

  const positive = (value: number | null | undefined): number | null =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : null;
  const count = positive(type.conductorCount);
  const grounds = positive(type.groundCount);

  /*
    A CABLE never shows the count, and a test is why.

    The count describes what is INSIDE the jacket, so a 12-2 MC stores two
    conductors and one ground — and printing either gives `2 x 12-2 MC`, which
    reads as two cables rather than one cable with two conductors in it. The
    cable's own name already says what is inside it. A pipe's does not, which
    is the whole reason the count is worth showing there.

    ── This paragraph used to say the column meant "including the ground" ─────
    That was true until 0063/0064 split the ground into its own column and its
    own count, and it was left describing a meaning the schema had stopped
    having — the exact fault CLAUDE.md names, a caption quietly restating the
    old meaning beside a number carrying the new one. The CONCLUSION never
    moved: whichever way the count is stored, a cable must not print one.
    Corrected 2026-09-20.

    The same "inside the jacket, not a multiplier" rule decides a cable's LABOR
    — see `runTypeComponentsPerFoot` in shared/runTypeLabor.ts, where reading it
    the other way would bill one foot of cable as two.
  */
  if (type.pathType === "cable") return conductor ?? raceway;

  // The count belongs to the conductor and means nothing without one, so it is
  // never printed on its own — "3 x" with nothing after it is not a fact.
  const wire =
    conductor && count !== null ? `${count} x ${conductor}` : conductor;

  /*
    ── The ground, and the case that made this worth writing carefully ────────
    Four states, and each says a different true thing:

      a named wire, one ground     "+ #12 bare copper"
      a named wire, two            "+ 2 x #12 bare copper"   isolated ground
      NO wire named, one ground    "+ ground"
      no ground, or nothing said   nothing

    The third is the one that matters and the one it would be easy to drop: a
    type can carry a ground without naming one. Printing nothing there would
    leave the label saying
    "2 #12 + ground" above a spec line that mentions no ground — which is the
    exact disagreement this whole line exists to remove, just reversed.

    "+ ground" is honest: there IS one, and nobody has said which.
  */
  const ground =
    grounds === null
      ? null
      : groundWire === null
        ? "ground"
        : grounds > 1
          ? `${grounds} x ${groundWire}`
          : groundWire;

  const core = [raceway, wire].filter(Boolean).join(" · ");
  return ground ? `${core} + ${ground}` : core;
}

/**
 * What a run is CALLED on screen — derived, never stored.
 *
 * ── Why nothing writes this down ────────────────────────────────────────────
 * Every part of it already exists: the type says what the run is, and the two
 * end pickers say what it goes between. Storing the sentence they make would
 * be a fourth copy of three facts, stale the moment any of them is edited —
 * the same reason a count is derived from its marks rather than kept as a
 * number beside them.
 *
 * ── Why the run's own name is last ──────────────────────────────────────────
 * `takeoff_runs.name` has only ever held a placeholder the app generated:
 * "Run on Sheet 3", three times per sheet, which is the complaint this
 * function answers. There is no rename anywhere in the app, so nothing here is
 * overriding a person's choice — and when a rename does arrive it goes in
 * FRONT of this, as the one thing a person said out loud.
 *
 * Ends are used only when BOTH are known, and a surface with room for two
 * lines takes the halves from `runNameParts` instead of cutting this string.
 */
export function runDisplayName(
  run: {
    runTypeLiveLabel?: string | null;
    runTypeLabel?: string | null;
    name?: string | null;
    startKind?: string | null;
    endKind?: string | null;
  },
  /**
   * The company's merged height types, so an end reads as its LABEL.
   *
   * What a run stores at each end is a slug, and showing one is how this read
   * "junction-box-wall → ceiling-box" the first time it was looked at. The list
   * comes from the caller because a company's own type is only nameable from a
   * row — see `heightTypeLabel`, which also covers what happens without it.
   */
  endTypes?: readonly { typeKey: string; label: string }[]
): string {
  const { type, ends } = runNameParts(run, endTypes);
  return ends ? `${ends}, ${type}` : type;
}

/**
 * The same name, in its two halves, for a surface that can show them apart.
 *
 * ── Why this exists rather than the row splitting the string ────────────────
 * A run row is two lines: what it IS on top, where it GOES underneath. Getting
 * those by cutting `runDisplayName` at a comma would work until a type is
 * called `1/2" EMT, 2 #12 + ground` — which is what they are all called. So the
 * halves come from here, and the joined sentence is built FROM them, which is
 * the only arrangement where the two cannot disagree.
 *
 * ── Why the row stopped being one line ──────────────────────────────────────
 * The joined name needs 374px in a 306px slot on a real run, and what falls off
 * the end is the TYPE — so `Junction box, wall → Ceiling box / fixture, 12…`
 * cannot tell you whether it is 12-2 or 12-3. That is a different wire and a
 * different number, and colour cannot say which. Measured in the running app on
 * 2026-09-18; three of the five rows on that sheet fit with ONE pixel to spare,
 * so it is not a long-name problem, it is every name.
 *
 * Type on top because it is what prices the run. Ends underneath because they
 * are what tells two runs of one type apart, and because losing THEM to
 * truncation costs a good deal less.
 */
export function runNameParts(
  run: {
    runTypeLiveLabel?: string | null;
    runTypeLabel?: string | null;
    name?: string | null;
    startKind?: string | null;
    endKind?: string | null;
  },
  endTypes?: readonly { typeKey: string; label: string }[]
): { type: string; ends: string | null } {
  const from = heightTypeLabel(run.startKind, endTypes);
  const to = heightTypeLabel(run.endKind, endTypes);
  return {
    type: runName(run),
    // Both, or neither. "Panel → …" is a half-sentence that reads like a bug.
    ends: from && to ? `${from} → ${to}` : null,
  };
}

/** A traced run as the counter needs it. */
export type RunRecord = {
  id: number;
  sheetId: number;
  name: string;
  pathType: "conduit" | "cable";
  points: PagePoint[];
  /** Null when the sheet could not be measured — see takeoffQuantities. */
  runFeet: number | null;
};

/** Many marks of one counted thing, gathered. */
export type CountedAssembly = {
  kind: "assembly";
  /** The group these belong to. Null only for pre-phase-6 marks. */
  groupId: number | null;
  /** Null for a plain count, or an assembly deleted since it was stamped. */
  assemblyId: number | null;
  name: string;
  /** How many were dropped. Derived from the stamps themselves. */
  count: number;
  /** Every instance, so the list can walk through them one at a time. */
  stamps: StampRecord[];
};

/** One traced run. */
export type CountedRun = {
  kind: "run";
  runId: number;
  name: string;
  pathType: "conduit" | "cable";
  /** Null when unmeasurable — shown as such, never as 0. */
  feet: number | null;
  /** Where to jump to: the run's first vertex. */
  at: PagePoint | null;
  sheetId: number;
};

export type CountedItem = CountedAssembly | CountedRun;

/**
 * Gather marks into the things they are counting.
 *
 * ── Three keys, in order, and the order is the history ───────────────────────
 * The GROUP where there is one, which from phase 6 is every mark placed. Two
 * groups may legitimately share a label — the router discourages it rather than
 * forbidding it, see drizzle/schema.ts — so the id is the identity and the
 * label is only what it is called.
 *
 * Then the two pre-phase-6 keys, unchanged, for marks placed before groups
 * existed and for any the backfill could not reach: the ASSEMBLY id where there
 * is one, and the NAME where there is not. A mark whose library assembly has
 * since been deleted keeps its snapshot name, and two such orphans of the same
 * name are the same thing to a person reading the list; keying them by their
 * null id would collapse every deleted assembly into one meaningless row.
 *
 * Order is by first appearance, so the list does not reshuffle as more stamps
 * land — a list that reorders itself while you are clicking is a list you
 * cannot keep your place in.
 */
export function groupStamps(stamps: StampRecord[]): CountedAssembly[] {
  const groups = new Map<string, CountedAssembly>();

  for (const stamp of stamps) {
    const key =
      stamp.groupId !== null
        ? `group:${stamp.groupId}`
        : stamp.assemblyId !== null
          ? `id:${stamp.assemblyId}`
          : `name:${stamp.name.trim().toLowerCase()}`;

    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.stamps.push(stamp);
      continue;
    }
    groups.set(key, {
      kind: "assembly",
      groupId: stamp.groupId,
      assemblyId: stamp.assemblyId,
      name: stamp.name,
      count: 1,
      stamps: [stamp],
    });
  }

  return Array.from(groups.values());
}

/** Runs as list entries, each pointing at its first vertex. */
export function runEntries(runs: RunRecord[]): CountedRun[] {
  return runs.map(run => ({
    kind: "run" as const,
    runId: run.id,
    name: run.name,
    pathType: run.pathType,
    feet: run.runFeet,
    at: run.points.length > 0 ? run.points[0] : null,
    sheetId: run.sheetId,
  }));
}

/**
 * The whole counted-items list: stamped assemblies first, then traced runs.
 *
 * Stamps lead because they are the higher-frequency action — an estimator
 * drops dozens per sheet and traces a handful of runs — so the thing they are
 * actively adding to stays at the top where they can watch it climb.
 */
export function buildCountedItems(
  stamps: StampRecord[],
  runs: RunRecord[]
): CountedItem[] {
  return [...groupStamps(stamps), ...runEntries(runs)];
}

/** Total pieces stamped, across every assembly. */
export function totalStampCount(stamps: StampRecord[]): number {
  return stamps.length;
}

/**
 * Where a stamp sits, as a point.
 *
 * Trivial, but it keeps the string→number conversion in one place: stamp
 * coordinates arrive from the database as decimal strings, and a `+` on one of
 * those concatenates rather than adds.
 */
export function stampPoint(stamp: {
  x: number | string;
  y: number | string;
}): PagePoint {
  return { x: Number(stamp.x), y: Number(stamp.y) };
}

/**
 * Which stamps sit within a boxed region — the legend-capture selection.
 *
 * Inclusive of the edges, and tolerant of a box dragged in any direction: a
 * user dragging up-and-left produces a negative width, and refusing that would
 * mean the tool only worked one way round.
 */
export function stampsInRegion(
  stamps: StampRecord[],
  region: { x: number; y: number; width: number; height: number }
): StampRecord[] {
  const left = Math.min(region.x, region.x + region.width);
  const right = Math.max(region.x, region.x + region.width);
  const top = Math.min(region.y, region.y + region.height);
  const bottom = Math.max(region.y, region.y + region.height);

  return stamps.filter(
    s => s.x >= left && s.x <= right && s.y >= top && s.y <= bottom
  );
}

/** Normalise a symbol label into the key its uniqueness is judged on. */
export function symbolLookupKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}
