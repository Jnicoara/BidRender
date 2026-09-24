/**
 * What a circuit added to a traced run starts as, and what it is called.
 *
 * ── Why this is a lib file and not three functions in RunsPanel ─────────────
 * `vitest.config.ts` covers `server/**`, `client/src/lib/**` and `scripts/**`
 * — not React components. These three decisions are exactly the kind that go
 * wrong quietly: a default conductor count is a wire quantity on a bid, and a
 * duplicate circuit name makes the per-circuit footage lookup (which matches on
 * the name) report the wrong row's feet. CLAUDE.md § "Prefer a forcing function
 * to a reminder" — `commitNullableEdit` moved here for the same reason, because
 * a rule with no red to go to is an instruction.
 */

/** The counts a run's TYPE says one circuit of it pulls. Either may be unsaid. */
export type CircuitDefaults = {
  conductorCount: number | null;
  groundCount: number | null;
} | null;

/** Just enough of a circuit to name the next one without clashing. */
export type NamedCircuit = { name: string };

/**
 * What a new circuit starts as when the run's type does not say: two
 * conductors and a ground.
 *
 * ── It used to be a bare 3, and that stopped being right ───────────────────
 * Three was "2 and a ground" while one column counted both. After 0063 split
 * them, a bare 3 means THREE UNGROUNDED CONDUCTORS — the same wire footage, and
 * a description of something nobody wires. Typing a lighting circuit would have
 * produced a row reading "3 cond. 0 gnd.".
 *
 * So the default moved rather than the number: the footage is unchanged at
 * three wires, and what the row SAYS is now what an electrician would say.
 */
export const NEW_CIRCUIT = { conductors: 2, grounds: 1 } as const;

/**
 * What a new circuit on this run starts as: what its type says it pulls.
 *
 * A run traced under `1/2" EMT · 2 x #12 THHN + gnd` is a run somebody has
 * already described, and asking them to retype 2 and 1 on every circuit is the
 * per-run form D3 rejected by name. So the type's own counts are the default
 * and `NEW_CIRCUIT` is the fallback for a type that does not say — which is a
 * real state (`conductorCount` is nullable precisely so a half-defined type
 * does not claim a number nobody typed) and must not be read as zero.
 *
 * The count is still the estimator's: it lands in an editable row, not on the
 * bid unseen.
 */
export function newCircuitFor(defaults: CircuitDefaults): {
  conductors: number;
  grounds: number;
} {
  return {
    conductors: positive(defaults?.conductorCount) ?? NEW_CIRCUIT.conductors,
    /*
      ZERO IS AN ANSWER FOR A GROUND, and is kept rather than falling back.

      A type saying a circuit carries no ground is a decision somebody typed —
      a feeder in pipe with its EGC pulled separately — and replacing it with
      the fallback 1 would put bare copper on the bid that the type says is not
      there. Zero CONDUCTORS is not a circuit at all, so it falls back instead.
    */
    grounds: zeroOrMore(defaults?.groundCount) ?? NEW_CIRCUIT.grounds,
  };
}

/**
 * The name the next circuit is offered: `Ckt 1`, then `Ckt 2`, and so on.
 *
 * A SUGGESTION in an editable, selected-on-focus box rather than a name the
 * app assigns. Auto-naming would be a one-way door — the row shows the name as
 * plain text — and a blank box is what made adding a second circuit feel like
 * starting a form again. It skips names already on the run so adding, removing
 * and adding again cannot offer a duplicate.
 */
export function nextCircuitName(circuits: readonly NamedCircuit[]): string {
  const taken = takenNames(circuits);
  for (let n = 1; n <= 99; n++) {
    const name = `Ckt ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  return "Ckt";
}

/**
 * The name offered for the NEXT circuit, straight after one was added.
 *
 * `nextCircuitName` cannot answer this: the circuit just added is not in the
 * list until the refetch lands, so it would offer `Ckt 1` twice and the second
 * Enter would add a duplicate name — which the per-circuit footage lookup
 * matches on. So the suggestion comes from what was actually typed, with its
 * trailing number bumped: `Ckt 1` then `Ckt 2`, and `Panel A-3` then
 * `Panel A-4`, which is how an estimator enters several circuits off one panel.
 *
 * A name with no number in it gets a BLANK box rather than a guess — there is
 * no sensible successor to "Feeder", and a placeholder asking for one is
 * honest where an invented name is not.
 */
export function suggestAfter(
  justUsed: string,
  circuits: readonly NamedCircuit[]
): string {
  const used = justUsed.trim();
  const taken = takenNames([...circuits, { name: used }]);
  const parts = /^(.*?)(\d+)(\D*)$/.exec(used);
  if (!parts) return "";
  const [, head, digits, tail] = parts;
  let n = Number(digits);
  for (let i = 0; i < 99; i++) {
    n++;
    const candidate = `${head}${n}${tail}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return "";
}

function takenNames(circuits: readonly NamedCircuit[]): Set<string> {
  return new Set(circuits.map(c => c.name.trim().toLowerCase()));
}

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function zeroOrMore(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}
