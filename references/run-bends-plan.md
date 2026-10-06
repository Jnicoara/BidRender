# Run bends — plan (Track B, 2026-10-06)

PLAN ONLY. No code, no migration. § 6 lists the columns Track A would add,
and they are in todo.md, "Track A next migration batch".

## 0. Read this first: most of this is already counted

The request said runs "don't count field bends, elbows or LBs, so their
hours and material are missing from bids today". **Measured 2026-10-06 on
`track-b`, that is not what the code does.** Since D19 (2026-09-26,
migration 0084) a traced conduit run counts, from its drawn geometry, in
plain code (`shared/runBends.ts`, `shared/runFittings.ts`):

| Counted today                 | How                                                                                             | Reaches the bid as                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 90° and 45° elbows            | each drawn corner by angle (15–67° → 45, 67–112° → 90, more → 90 + 45); one 90 per counted drop | `elbow90` / `elbow45` lines — material + the elbow's own hours        |
| Field bends                   | the same corners, below the company's factory-elbow size (default 1-1/4")                       | `fieldBend` lines — $0 material + the raceway's `fieldBendLaborHours` |
| LBs and pull boxes            | proposed past 360° of bends; added only when a person says yes                                  | `lb` / `pullBox` lines — material + their hours                       |
| Couplings, connectors, straps | stick length, ends, strap spacing                                                               | material; their labor is inside the per-foot rate (owner, 2026-09-29) |

**So the underbid is real, but it is mostly not where the request put it:**

1. **No labor unit is set on any shipped material** — pipe, wire, elbows,
   LBs, field bends. Every one of those lines reads "Not priced" for labor
   until the company sets hours. That is the biggest gap, and the labor-unit
   sheet (`pricing/labor-units-starter.xlsx`, built the same day) is the fix:
   it writes `laborHours` and `fieldBendLaborHours`.
2. **What genuinely is not counted** (the rest of this plan):
   - **kicks, offsets and saddles at boxes** — plans do not draw them, so
     every count already reads "at least" (`NO_KICKS`);
   - **the 90 at a drop whose height is unknown** — counted the moment the
     height is set (references/vertical-drops-plan.md); until then a note;
   - **an unanswered pull point** — no LB or box is bought until somebody
     says yes; the row says "proposed and not answered yet";
   - **a quantity-mode run's pull points** — none proposed, by D21;
   - bends on flex and cable — none, by design (they bend themselves).

## 1. Decisions this plan has to respect — and one it would reverse

| Decision                                                                                                                                                 | Where                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **D3:** a per-run calculator form (type, size, fittings, waste, pull points…) is REJECTED as bloat                                                       | takeoff-spec.md D3                 |
| **D15:** nothing typed per run on the Takeoff screen; defaults are set once                                                                              | takeoff-spec.md D15                |
| **D19:** bends come from the geometry, every count reads "at least"; **"Nothing here is typed per run"**; an LB is never added without a person's answer | takeoff-spec.md D19                |
| **D17 (2026-09-29):** couplings/connectors/straps are in the per-foot rate; elbows, field bends, LBs, boxes keep their own hours                         | takeoff-spec.md D17(b) note        |
| A routing extra % covers unseen offsets in LENGTH, not in fittings                                                                                       | takeoff-spec ~1483, overhaul § 2.2 |
| A user assembly that holds an elbow is left unguarded (double count), by decision                                                                        | D19 answer 6                       |

**The request asks for a TYPED bend count on a run.** That reverses D15's
and D19's "nothing typed per run" for this one field. It is the owner's
call (§ 7, Q1). The plan below is built so the typed number is an
**override, never a form**: a run nobody touches gets the drawn count plus
an allowance, and the field is one number on the run row, collapsed with
the rest of the run's "more" (CLAUDE.md § "Customization available, but
never in the way").

## 2. The allowance for what plans do not draw — the sensible default

**Kicks and offsets at boxes.** A run that ends at a box on a surface or
in a wall usually takes a kick (one bend) or an offset (two) to get into
the knockout. The plans never show it.

- **Company default: kicks per box end**, set once (Settings → Heights &
  extra, beside the bend limits). NULL = not set.
- **Not set (NULL): nothing is added, and the run says so in amber** —
  "Kicks and offsets at boxes are not counted". Never a silent zero, and
  never a number nobody chose (CLAUDE.md § Starter content).
- **A starter value, shown and inert until accepted**, the way the extra %s
  and makeup ship: "1 kick per box end — starter, verify against your own
  work". Accepted, it applies to every run that has no typed count.
- **What a kick buys:** below the factory-elbow size, a field bend (labor
  only, the raceway's `fieldBendLaborHours`); at or above it, a 45° elbow
  (material + its hours) — the same `bendMethodFor` rule the drawn bends
  already use, so the allowance cannot price a kick differently from a
  drawn corner.
- **Which ends:** an end whose kind is a device or a panel (the same ends
  that take a drop), not a tee and not "carries on at run height".

The run row shows the arithmetic, never a lump: "Bends: 3 drawn (at least)

- 2 at boxes (allowance) = 5".

## 3. The typed count — an override, with the default beside it

- **"Bends on this run"**: one number, empty by default. Empty = drawn +
  allowance (§ 2). A typed number REPLACES that total for this run and the
  row says "typed" in place of the arithmetic.
- `InlineNumberField` with `whenUnset={{ placeholder: "5 — 3 drawn + 2 at boxes" }}`:
  the placeholder is the default in effect, so empty never reads as 0
  (CLAUDE.md § 6, measurement convention).
- **How a typed count splits into fittings:** the drawn corners keep their
  angles (a typed 6 on a run with three drawn 90s is those three 90s + 3
  more); the extra ones are priced as kicks (§ 2's rule). A typed number
  BELOW the drawn count is allowed — the estimator knows the drawing
  over-states it — and the row says "fewer than drawn" in amber.
- **Amber flag** whenever the bends on a run rest on an assumption the
  estimator has not confirmed: the allowance is a starter not yet accepted,
  or not set at all.
- **Quantity-mode runs** take the same field; **cable and flex** do not
  (no bends to count).

## 4. Pull points and drops — no change, said here so nobody rebuilds them

- Unanswered pull points stay unbought until answered (D19: "never added
  without a person's answer"). The run row's "proposed and not answered
  yet" note becomes amber, so it is not read past on bid day.
- A drop's 90 waits for its height (vertical-drops-plan). No change.

## 5. Where it lands — no new path

Every bend, drawn, allowed or typed, goes through `countFittings` →
`fittingRowsByRunType` → the run type's `fieldBend` / `elbow45` / `elbow90`
lines on the bid. One path, so Send, Send-again, the quantity lock, markup
and the materials list all follow without new code. The bend count is
derived on read, like the rest of a run's fittings.

## 6. Columns Track A would need

All ADDITIVE, nullable, **no DEFAULT**, no backfill.

| Column                                                   | Meaning                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `takeoff_runs.typedBendCount INT NULL`                   | "Bends on this run", typed. NULL = drawn + allowance. Only if the owner says yes to Q1.              |
| `takeoff_bend_defaults.kicksPerBoxEnd DECIMAL(4,2) NULL` | The company's allowance for kicks/offsets at a box end. NULL = not counted, said in amber.           |
| `takeoff_bend_defaults.kicksAcceptedAt TIMESTAMP NULL`   | When the starter allowance was accepted; NULL = the starter is shown and inert (the extras pattern). |

No column is needed for the labor units themselves: `materials.laborHours`
and `materials.fieldBendLaborHours` exist (0065, 0084).

## 7. Owner questions

1. **A typed bend count per run** (§ 3) reverses D15/D19's "nothing typed
   per run" for this one field. Yes, as an override that defaults to drawn
   - allowance? Or no, and the company allowance (§ 2) alone?
2. **The starter allowance:** 1 kick per box end, shown and inert until
   accepted — or a different number, or none shipped?
3. **Ends at a device in a stud wall** (where pipe enters the box straight
   from above): count a kick there too, or only at surface boxes and
   panels? (Recommended: every device or panel end; the estimator lowers it
   per run if the job is all straight-in.)

## 8. Test plan

- **Known-answer run** (fixture prices and hours, never shipped ones):
  ½" EMT, three drawn 90° corners, panel → receptacle, both ends at boxes,
  allowance 1 kick per box end accepted, factory elbows from 1-1/4":
  drawn 3 field bends + 2 kicks = **5 field bends**, × 0.15 h =
  **0.75 h**, $0 material. Same run in 2" EMT: 3 × 90° elbows + 2 × 45°
  elbows (kicks at factory size). Typed 4: **4**, row says "typed"; typed 2:
  "fewer than drawn", amber.
- Allowance NULL: kicks 0, run row amber "not counted" — and NOT a zero
  presented as an answer.
- Starter not accepted: applies nothing (the extras test pattern).
- A tee end and a "carries on" end take no kick.
- Send/Send-again: the field-bend line's quantity moves with the typed
  count; a locked bid refuses the edit.
- On screen at laptop and tablet: the run row's arithmetic and the amber.
