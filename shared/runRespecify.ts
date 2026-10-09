/**
 * Saying what a FINISHED run is made of — the decisions, without a database.
 *
 * ── Why this goes through a TYPE, not onto the run ───────────────────────────
 * D3 (references/takeoff-spec.md) chose "choose before tracing, and remember
 * it" and rejected "a form on every run" by name. A run carries where it is and
 * how long; its TYPE carries what it is made of. So editing a finished run's
 * conduit, wire and wire count does not give that run private material columns
 * — it points the run at the type that says exactly that, finding one already
 * in the palette or making it. That is D3(b), "the way to change it later",
 * with the materials as the way in rather than a list of type names.
 *
 * It is also why the edit reaches the bid the same way a trace-time choice
 * does: the bid bridge groups footage by type, so there is no second path.
 *
 * Editing the type ITSELF is still what the palette's pencil does, and it moves
 * every run of that type. This moves one run.
 */

import { withUndergroundSuffix } from "./undergroundRunTypes";

export type RunPathType = "conduit" | "cable";

/** What a type is made of — the fields that decide whether two are the same. */
export type RunTypeSpecFields = {
  pathType: RunPathType;
  racewayMaterialId: number | null;
  conductorMaterialId: number | null;
  conductorCount: number | null;
  groundMaterialId: number | null;
  groundCount: number | null;
};

/**
 * The spec a run is being given, built from what the editor sent and what the
 * run's CURRENT type says about the fields the editor does not show.
 *
 * ── A form that cannot edit a field must not clear it ───────────────────────
 * CLAUDE.md § Editing fields, rule 7. The editor shows conduit, wire and a
 * count; it does not show the ground. So the ground rides along from the
 * current type untouched — a run given a new wire size keeps its bare copper.
 *
 * A CABLE is the exception in the other direction: its conductor and ground
 * counts describe what is inside ONE jacket, so they belong to the cable
 * chosen, not to the run. Changing the cable takes the new cable's own counts
 * (from a matching type, see `findMatchingRunType`) or the same defaults a
 * trace-time pick from the catalog uses.
 */
export function wantedSpec(input: {
  pathType: RunPathType;
  racewayMaterialId: number | null;
  conductorMaterialId: number | null;
  conductorCount: number | null;
  /**
   * "No wire (empty pipe)" — a spare, a sleeve, a trench conduit for a
   * future pull (2026-10-08). The type it lands on says 0 conductors, which
   * is "says no wire" (shared/runNoWire.ts), never NULL, which is "not
   * said". Required so a caller decides rather than inheriting a default.
   */
  emptyPipe: boolean;
  /**
   * The ground, when the editor showed it — only on a run whose type names
   * none (an underground trench, 2026-10-08). Absent rides along from the
   * current type (rule 7), as it always has.
   */
  groundMaterialId?: number | null;
  current: RunTypeSpecFields | null;
}): RunTypeSpecFields {
  const current = input.current;
  if (input.emptyPipe) {
    /*
      A GUARD on every wire field, not a pass-through (rule 7's other half):
      an empty pipe has no ground in it either, and a ground carried over
      from the type it came from would buy bare copper for a spare conduit.
    */
    return {
      pathType: "conduit",
      racewayMaterialId: input.racewayMaterialId,
      conductorMaterialId: null,
      conductorCount: 0,
      groundMaterialId: null,
      groundCount: 0,
    };
  }
  if (input.pathType === "cable") {
    const sameCable =
      current !== null &&
      current.conductorMaterialId === input.conductorMaterialId;
    return {
      pathType: "cable",
      // A cable has no pipe. A GUARD, not a pass-through: see RunTypePicker.
      racewayMaterialId: null,
      conductorMaterialId: input.conductorMaterialId,
      conductorCount: sameCable ? current.conductorCount : 1,
      groundMaterialId: sameCable ? current.groundMaterialId : null,
      groundCount: sameCable ? current.groundCount : null,
    };
  }
  return {
    pathType: "conduit",
    racewayMaterialId: input.racewayMaterialId,
    conductorMaterialId: input.conductorMaterialId,
    // A count of wires with no wire named is not a thing anybody can buy. An
    // unsent count — the field is hidden on a run with several circuits —
    // keeps the type's, for the same reason the ground does.
    conductorCount:
      input.conductorMaterialId === null
        ? null
        : (input.conductorCount ?? current?.conductorCount ?? null),
    ...(input.groundMaterialId === undefined
      ? {
          groundMaterialId: current?.groundMaterialId ?? null,
          groundCount: current?.groundCount ?? null,
        }
      : {
          groundMaterialId: input.groundMaterialId,
          // One ground per circuit unless the type already said otherwise —
          // the same default "Add wires" gives a new circuit.
          groundCount:
            input.groundMaterialId === null
              ? (current?.groundCount ?? null)
              : (current?.groundCount ?? 1),
        }),
  };
}

/**
 * A type in the palette that already says exactly this, if there is one.
 *
 * Exact on every field, so a match never changes what the run is made of. For
 * a cable only the cable itself has to match: its counts are the jacket's, and
 * a saved "12-2 MC cable" type saying 2 + ground is better information than
 * the trace-time default of 1.
 *
 * The CURRENT type wins a tie, so saving without changing anything is a no-op
 * rather than a hop to an identical twin.
 */
export function findMatchingRunType<
  T extends RunTypeSpecFields & { id: number },
>(
  palette: readonly T[],
  want: RunTypeSpecFields,
  currentId: number | null,
  /**
   * The EXTRAS a match must carry (tape on a trench, 0135), as
   * `extrasSignature` strings: what the run's current type carries, and a
   * reader for every palette row. Required — see `extrasSignature`.
   */
  extras: { want: string; of: (typeId: number) => string }
): T | undefined {
  const sameMaterials = (t: T) =>
    want.pathType === "cable"
      ? t.pathType === "cable" &&
        t.conductorMaterialId === want.conductorMaterialId
      : t.pathType === want.pathType &&
        t.racewayMaterialId === want.racewayMaterialId &&
        t.conductorMaterialId === want.conductorMaterialId &&
        t.conductorCount === want.conductorCount &&
        t.groundMaterialId === want.groundMaterialId &&
        t.groundCount === want.groundCount;
  const matches = palette.filter(
    t => sameMaterials(t) && extras.of(t.id) === extras.want
  );
  return matches.find(t => t.id === currentId) ?? matches[0];
}

/**
 * What a type's EXTRAS are, as one comparable string — material, feet per
 * foot and which feet, in a fixed order. "" for a type with none.
 *
 * ── Why a match has to agree on these too (2026-10-08) ──────────────────────
 * The run editor shows conduit, wire and a count; it does not show extras. So
 * by rule 7 they ride along from the run's current type, exactly as the
 * ground does. Without this, picking the wire for a run on
 * `2" PVC Sch 40, underground` landed it on a type made of the same pipe and
 * wire and NO TAPE — or on a shop's plain `2" PVC` type — and the trench's
 * warning tape left the bid with nothing on screen to say so: a lower number,
 * from the edit that was meant to make it more complete.
 *
 * An extra whose material was deleted carries no material and is left out:
 * it prices nothing (getRunTypeExtrasFor), and it cannot be copied.
 */
export type ExtraSpec = {
  materialId: number | null;
  feetPerFoot: number;
  appliesTo: "flat" | "all";
};

export function extrasSignature(extras: readonly ExtraSpec[]): string {
  return extras
    .filter(e => e.materialId !== null)
    .map(e => `${e.materialId}:${e.feetPerFoot.toFixed(4)}:${e.appliesTo}`)
    .sort()
    .join("|");
}

/**
 * The name a type made here is given — what it is made of, in the words the
 * palette already uses (`3/4" EMT, 3 #12 THHN`).
 *
 * Never a clash: the palette refuses two types of one path with one name, so a
 * name already taken by a type with a DIFFERENT spec gets a number after it.
 */
export function respecifiedLabel(
  spec: RunTypeSpecFields,
  names: {
    raceway: string | null;
    conductor: string | null;
    /** The extras it carries, by material name — `+ Underground warning tape`. */
    extras: readonly string[];
    /**
     * The type it came from said "underground" (shared/undergroundRunTypes.ts
     * `saysUnderground`). Its tape is then named by that one word, as the
     * palette already does, instead of spelt out on every row it labels.
     */
    underground: boolean;
  },
  taken: ReadonlySet<string>
): string {
  let base: string;
  if (spec.pathType === "cable") {
    base = names.conductor ?? "Cable run";
  } else {
    const wire =
      names.conductor !== null
        ? spec.conductorCount === null
          ? names.conductor
          : `${spec.conductorCount} ${names.conductor}`
        : // Zero is "says no wire" (shared/runNoWire.ts) and is named so.
          spec.conductorCount === 0
          ? "empty pipe"
          : null;
    base =
      [names.raceway, wire]
        .filter((part): part is string => !!part)
        .join(", ") || "Conduit run";
  }
  // What it carries besides, so two types that differ only by tape do not
  // read the same in the picker.
  if (names.underground) base = withUndergroundSuffix(base);
  else if (names.extras.length > 0)
    base = `${base} + ${names.extras.join(" + ")}`;
  let label = base;
  for (let n = 2; taken.has(label.trim().toLowerCase()); n++) {
    label = `${base} (${n})`;
  }
  return label;
}

/**
 * What to do to the run's circuits so "number of wires" is true on THIS run.
 *
 * A run's wire comes from its circuits, never from its type
 * (server/runToBidWire.test.ts). So the count typed in the editor has to land
 * on a circuit or it changes nothing that is bought:
 *
 * - no circuits: add one carrying that many wires — the same as "Add wires";
 * - one circuit: set its count — the common case, a single homerun;
 * - several: leave them. Which of three circuits the number was meant for is
 *   not something to guess, and each has its own count in the rows below.
 */
export type CircuitPlan =
  | { kind: "none" }
  | { kind: "add"; conductors: number }
  | { kind: "update"; circuitId: number; conductors: number }
  | { kind: "several"; count: number };

export function circuitPlan(
  pathType: RunPathType,
  circuits: readonly { id: number; conductorCount: number }[],
  conductorCount: number | null
): CircuitPlan {
  if (pathType !== "conduit" || conductorCount === null)
    return { kind: "none" };
  if (circuits.length === 0) return { kind: "add", conductors: conductorCount };
  if (circuits.length === 1) {
    return circuits[0].conductorCount === conductorCount
      ? { kind: "none" }
      : {
          kind: "update",
          circuitId: circuits[0].id,
          conductors: conductorCount,
        };
  }
  return { kind: "several", count: circuits.length };
}
