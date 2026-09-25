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
  current: RunTypeSpecFields | null;
}): RunTypeSpecFields {
  const current = input.current;
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
    groundMaterialId: current?.groundMaterialId ?? null,
    groundCount: current?.groundCount ?? null,
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
  currentId: number | null
): T | undefined {
  const matches = palette.filter(t =>
    want.pathType === "cable"
      ? t.pathType === "cable" &&
        t.conductorMaterialId === want.conductorMaterialId
      : t.pathType === want.pathType &&
        t.racewayMaterialId === want.racewayMaterialId &&
        t.conductorMaterialId === want.conductorMaterialId &&
        t.conductorCount === want.conductorCount &&
        t.groundMaterialId === want.groundMaterialId &&
        t.groundCount === want.groundCount
  );
  return matches.find(t => t.id === currentId) ?? matches[0];
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
  names: { raceway: string | null; conductor: string | null },
  taken: ReadonlySet<string>
): string {
  let base: string;
  if (spec.pathType === "cable") {
    base = names.conductor ?? "Cable run";
  } else {
    const wire =
      names.conductor === null
        ? null
        : spec.conductorCount === null
          ? names.conductor
          : `${spec.conductorCount} ${names.conductor}`;
    base =
      [names.raceway, wire]
        .filter((part): part is string => !!part)
        .join(", ") || "Conduit run";
  }
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
