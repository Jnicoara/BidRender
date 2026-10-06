# Homerun footage — plan (DESIGN ONLY)

Track C, 2026-10-06. **Nothing here computes footage into a bid yet.** What
is built and read-only today is the input: circuits grouped from the
devices' own tags, with the device closest to each panel
(`@/lib/circuitGroups`, the "Circuits" panel on a sheet). This file says how
that becomes homerun footage, once the owner says build it.

If a number or a file named here does not match what you find, stop and
find out why before going on — either this file is stale or the code moved.

## 0. The owner's decisions (2026-10-06) — and what they override

- **Most plans do not draw homeruns.** Devices carry circuit tags ("2B-1");
  the estimator routes each circuit back to its panel. The drawn-homerun
  reader (`@/lib/homeruns`) is a rare-case helper: kept, not tuned further.
- **The user picks the homerun METHOD per bid, with a per-area override:**
  1. **Measured** (default) — the right-angle path from the circuit's
     closest device to its panel.
  2. **Average** — one length per circuit, entered by the user.
  3. **Measured with a minimum** — measured, but anything under a set
     length uses that length.
- **Every method adds vertical drops:** box up to the ceiling, down at the
  panel; **ceiling height per area**.
- **A per-job routing factor** (e.g. +15%), **added like other difficulty
  factors, not multiplied.**
- **Every homerun is overridable and starts unconfirmed.**
- **Waste stays material only; makeup stays separate (5 ft at the panel).**
- **The bid shows which method was used.**

**This overrides an older decision, and says so in both places.**
`plan-viewer-overhaul.md` § 6 ("No per-area heights … ceiling height stays
out of the model") and `vertical-drops-plan.md` § 2 ("Per-AREA heights and
'ceiling height' stay out", 2026-10-05) are narrowed: **for homeruns, the
owner wants a ceiling height per area.** Both files now carry a line
pointing here. § 4 below keeps it to the smallest change that does it: an
area is a SHEET first, reusing the per-sheet run height already queued.

## 1. What already exists — reuse, do not rebuild

| Piece                          | Where                                                                                                                       | Used for                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Circuits grouped by device tag | `client/src/lib/circuitGroups.ts` (built, read-only)                                                                        | Which devices are on each circuit; the closest one to the panel         |
| Right-angle distance           | `groupByCircuit` → `closest.distance` (\|dx\| + \|dy\|, page points)                                                        | The Measured length, before scale                                       |
| Panel schedules                | `@/lib/panelSchedules` + A's `bid_panels` / `bid_panel_circuits` (queued)                                                   | The circuit a homerun belongs to                                        |
| Sheet scale                    | `bid_pdf_sheets.scaleRatio` (+ the door-swing scale check)                                                                  | Points → feet. **No scale, no measured length** — said, never guessed   |
| Run height chain               | run → sheet (`bid_pdf_sheets.distributionHeightInches`, A's 0108, queued) → job (`bids.distributionHeightInches`) → company | "Ceiling" for the up-drop. The sheet layer IS the per-area height (§ 4) |
| Height types                   | `shared/takeoffHeights.ts`: `receptacle`, `switch`, **`panel`**, `ceiling-box`, …                                           | Box height at the device end, panel height at the panel end             |
| A mark's own height            | `takeoff_stamps.mountHeightInches` (0098)                                                                                   | Beats the type's height at the device end (nearest wins, drops § 2)     |
| How a drop adds                | `vertical-drops-plan.md` § 3: each device/panel end adds \|run height − its height\|                                        | **The same rule, unchanged** — a homerun is a run with two such ends    |
| Extra (waste) and makeup       | `takeoff_extra_defaults` / run type / run: `wireExtraPct`, `conduitExtraPct`, `makeupPanelInches`                           | Waste on material only; 5 ft (60 in) makeup at the panel                |
| Additive factors               | `modifiers` — percentages that ADD, never compound (`shared/pricing.ts`)                                                    | The model for the routing factor's arithmetic                           |
| Conductor counts               | `takeoff_run_circuits.conductorCount` / `groundCount` — entered, never derived                                              | Wire per homerun                                                        |
| Unconfirmed status             | `takeoff_stamps.status` (`unconfirmed`, `shared/markStatus.ts`)                                                             | The pattern for "starts unconfirmed"                                    |
| Traced runs                    | `takeoff_runs` + `takeoff_run_circuits.panelCircuitId` (requested)                                                          | A circuit with a TRACED homerun uses the trace, not a computed one      |

## 2. One homerun = one circuit

A homerun is **per circuit per bid**: `2B-14` is one homerun however many
devices hang off it. A two-pole tag (`2B-36,38`) is one homerun. It leaves
from **one device**: by default the closest to the panel, at right angles
(`circuitGroups.ts`); the estimator may pick another (§ 6).

Where the circuit has a TRACED homerun run tied to it
(`takeoff_run_circuits.panelCircuitId`), the trace wins and no computed
homerun is made for it — two footages for one wire is a double count.

## 3. The three methods

Let **L** be the horizontal length in feet for the method, **V** the
vertical (§ 4), **R** the routing factor (§ 5).

| Method                      | L                                                         | Needs                                    |
| --------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| **Measured** (default)      | right-angle distance closest-device → panel spot, × scale | a panel spot on the sheet, a sheet scale |
| **Average**                 | the user's one length per circuit                         | that one number                          |
| **Measured with a minimum** | max(measured, minimum)                                    | both of Measured's, plus the minimum     |

- **Right angle, not straight line**: homeruns run with the building's
  grid. The two differ by up to 41% on a diagonal, and the straight line is
  always the short one.
- **Measured without a panel spot or scale gives no number** and says which
  is missing ("Place panel 2B", "Set this sheet's scale"). It never falls
  back to the average silently.
- **Average needs nothing on the drawing** — the path for someone who will
  never place a panel (CLAUDE.md § "As manual or as automated as the user
  wants"). The panel card's "Place" stays optional under Average.
- **The method resolves area → bid**: an area's own method if set, else the
  bid's, else Measured. Average length and minimum resolve the same way.

## 4. Vertical drops, and what an "area" is

**V = |ceiling − device height| + |ceiling − panel height|** — the drop rule
from `vertical-drops-plan.md` § 3, applied to a homerun's two ends:

- **Device end**: the leaving device's own `mountHeightInches`, else its
  count's height type (`receptacle` 18", …). A floor box (`floor-box`) or an
  `underground` end follows the same rule, so a floor box under a slab adds
  its drop down, not up.
- **Panel end**: the `panel` height type (or the panel's own, if A gives
  panels a height later — not asked now).
- **Ceiling** = the area's run height, through the chain run → **sheet** →
  job → company. **Unset stays unset**: no ceiling, no vertical, said in
  amber ("Ceiling height not set — no drops on homeruns"), exactly as the
  drops gate already does. Never zero.

**Area = a sheet, first.** The per-sheet run height (A's 0108,
`bid_pdf_sheets.distributionHeightInches`) is already queued and is a
ceiling height per floor plan, which is the multi-storey case that made the
owner approve it. So the per-area override needs no new area model: the
method, average and minimum overrides go on the same sheet row (§ 9). A
true sub-sheet area (a wing, a mezzanine) would be `bid_areas` with a
region per sheet — **not proposed now**; `unitLabel` already groups scope by
area in text, and two area models are worse than one.

## 5. The routing factor — added, not multiplied

One percentage per job, starter suggestion +15% (shown dated and inert
until accepted, like the markup bands — CLAUDE.md "Unaccepted starters apply
nothing").

**Labor footage** = (L + V) × (1 + R).
**Material footage** = (L + V) × (1 + R + W) + makeup, where W is the wire
(or conduit) extra %.

R and W **add**: +15% routing and +10% waste is +25%, never 1.15 × 1.10 =
+26.5% — the same rule as job-condition modifiers (`modifiers` table
comment). That is how this plan reads "added like other difficulty factors,
not multiplied"; **owner to confirm** (Q1).

**Waste stays material only**: W never enters the labor footage.
**Makeup stays separate**: `makeupPanelInches` (starter 60 in = 5 ft) per
conductor at the panel end, added after the percentages and never scaled by
them. Device-end makeup is not added to a homerun (the device's own branch
wiring carries it) — **owner to confirm** (Q2).

**Worked example** (to become the known-answer test): closest device 40 ft
from the panel at right angles; receptacle at 18", ceiling 10'-0", panel
top at 6'-0" → V = 8.5 + 4 = 12.5 ft; R = 15%, W = 10%, makeup 5 ft; 2
conductors + ground.
Labor footage = 52.5 × 1.15 = 60.375 ft.
Wire per conductor = 52.5 × 1.25 + 5 = 70.625 ft; × 3 = 211.875 ft.
Average 25 ft instead: L = 25, the rest the same. Minimum 50 ft: L = 50.

## 6. Overridable, and starts unconfirmed

- Every computed homerun starts **unconfirmed**. On screen: amber, the way
  an unconfirmed AI mark is.
- **Override** = a typed length (replaces L + V, the percentages still
  apply) or a different leaving device. Either confirms it.
- **Confirm** without changing — one tap per row, and "Confirm all on this
  sheet" for the circuits whose method needed nothing guessed (Average, or
  Measured with the panel placed by a label).
- **Do unconfirmed homeruns count?** Proposed: yes, in the total, with the
  total saying "+ N homeruns unconfirmed" beside it — the "N not priced"
  pattern (`shared/lineNotPriced.ts`), so nothing is silently left out and
  nothing silently trusted. **Owner to confirm** (Q3).
- A re-read (a mark moved, a panel moved, the scale changed) re-computes an
  UNCONFIRMED homerun and leaves a confirmed or overridden one alone, but
  marks it "inputs changed since confirmed".

## 7. What the bid shows

One line per bid in the summary, and on the takeoff export:
**"Homeruns: Measured, +15% routing (2 sheets on Average 30 ft)"** — the
method, the factor, and every area that differs. Each homerun line names
its own method ("Measured · 40 ft + 12.5 ft drops"). A proposal never
prints the method unless the estimator turns it on — it is how the number
was made, not what the customer buys.

## 8. Wire and conduit per homerun

The circuit's wire comes from a **homerun run type** chosen once per bid
(e.g. "3/4" EMT, #12 THHN"), with conductors and ground **entered on the
type, never inferred** (`conductorCount`'s rule). A circuit whose panel
schedule says `#10` does not silently change the type — it is flagged
("2B-30: schedule says #10, homerun type is #12").

## 9. Columns (Track A) — listed in todo.md

`todo.md` § "Track A next migration batch" → "Homerun footage". In short:
the method, average, minimum and routing factor on `bids`; the method,
average and minimum overrides on `bid_pdf_sheets` (the area); the panel's
spot on `bid_panels`; override + confirmed + leaving device on
`bid_panel_circuits` (one homerun per circuit). Ceiling height per area is
**already queued** (0108) and is not asked twice.

## 10. Build order (when told to build)

1. `shared/homerunFootage.ts`: pure — method resolution, L, V, the two
   footages, from plain inputs. The worked example as its first test.
2. Panel spots move from this browser to `bid_panels` (needs the column).
3. Homerun rows on the Circuits panel: method, footage, confirm/override.
4. Bid summary line and export; the bid line with its snapshot rules.

## 11. Questions for the owner

1. **Q1** Routing and waste add (+25%), as § 5 reads it — right?
2. **Q2** Makeup at the panel end only on a homerun, none at the device?
3. **Q3** Unconfirmed homeruns counted in the total with "+ N unconfirmed"
   beside it, or left out until confirmed?
4. **Q4** Area = sheet for now (no sub-sheet areas) — enough?

## 12. Test plan

- The worked example, all three methods, to the thousandth of a foot.
- Right angle beats straight line (a fixture whose legs differ — CLAUDE.md
  on fixtures shaped like their container).
- No scale → no measured number; no ceiling → no vertical; never zero.
- Area override beats bid; bid beats default; Average needs no panel spot.
- Routing and waste add; waste absent from labor; makeup unscaled.
- A traced homerun suppresses the computed one for that circuit.
- A confirmed homerun survives a moved mark; an unconfirmed one moves.
