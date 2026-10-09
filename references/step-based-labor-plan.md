# Step-based labor — build an assembly's hours from its work steps. PLAN, 2026-10-09

**Track C. PLAN ONLY: no code, no migration, no seed.** For the owner to
adjust, then for whoever builds it. The draft step times in § 10–11 are
starting points written from the work itself, with the reasoning shown, and
are meant to be changed.

## 0. What it is, in one paragraph

An assembly can list the **work steps** it takes (mount the box, pull the
cable, strip and terminate, set the device, put the plate on, test), each with
a time and a count. **Steps are shared**: change "Strip and terminate a
device" once and every assembly that uses it re-totals. **The steps' total
becomes the assembly's hours**, tagged **"Example hours"** until the shop
accepts it. **A typed number still wins**: if somebody types the assembly's
hours, those price, and the step total sits beside them as a quiet
cross-check. A shop that never opens the steps sees no difference at all.

## 1. Decisions this builds on — read before changing anything here

Searched 2026-10-09 (CLAUDE.md § "Where decisions live"). Each is cited
where it applies below.

| Decision                                                                                                               | Where                                                                                                       | What it means here                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The typed number on an assembly prices. Always.** Component hours shown beside it, "always visible, never a warning" | `ASSEMBLIES_PLAN.md` § "What must come with it" 3                                                           | The owner's "typed hours still win; step total beside it as a quiet cross-check" is the same rule, applied to steps. Agreed, not reopened                 |
| **Two places can hold hours, so ownership is decided in ONE function**                                                 | `ASSEMBLIES_PLAN.md` § "What must come with it" 2                                                           | Steps are a third source. § 3 is that one function                                                                                                        |
| **Hours NULL = "Hours not set", never 0**                                                                              | `starter-assemblies-plan.md` D1; `shared/assemblyHours.ts`; CLAUDE.md § Editing fields 6                    | A step with no time makes the step total NOT SET, not a smaller number (§ 6a)                                                                             |
| **"Example hours"**: shown on the shop's screen, never on the customer quote, clears on edit, print warns              | `starter-vs-company-plan.md` § "Shipped HOURS get the price treatment"; `shared/exampleTags.ts`; 0133       | Step times ship as example times; § 4                                                                                                                     |
| **Read published labor tables for understanding, then write independently; never transcribe**                          | `ASSEMBLIES_PLAN.md` § "Where labor hours come from"; `STARTER_LIBRARY.md`                                  | Stricter here, by the owner: **no NECA, RSMeans or any published table is copied or used as a source of numbers.** § 9                                    |
| **Modifiers replace difficulty tiers — additive, on the bid; productivity applied after**                              | `ASSEMBLIES_PLAN.md` § "Modifiers replace difficulty tiers"; CLAUDE.md § Company defaults                   | Steps produce the BASE hours only. No difficulty per step (§ 6b)                                                                                          |
| **`overheadLaborHours`**: flat time no material line accounts for (layout, testing, cleanup, the walk to the van)      | `drizzle/schema.ts`, `assemblies.overheadLaborHours`                                                        | Stays its own field, added once. Steps do not duplicate it (§ 6c)                                                                                         |
| **Materials carry a labor unit; runs read the same number** (pipe and wire hours off the material row)                 | `ASSEMBLIES_PLAN.md` § "Materials carry a labor unit", § "Run types read the same number"; takeoff-spec D17 | Drops and runs keep their own hours. And the cable INSIDE an assembly should read that same per-foot number rather than a second one on a step (§ 6d, Q1) |
| **A bid line's snapshot never moves**                                                                                  | CLAUDE.md § Architecture (`bid_line_items`)                                                                 | Changing a step re-totals assemblies, never a priced bid (§ 5)                                                                                            |
| **As manual or as automated as the user wants**; **simple by default, deep when asked**                                | CLAUDE.md                                                                                                   | Steps sit behind "More options"; nothing requires them (§ 7)                                                                                              |
| **Shipped numbers live in the seed files, re-stamped on boot; a shop's edit forks**                                    | CLAUDE.md § "Where a priced catalog lands"                                                                  | Shipped steps are seed rows like materials (§ 2)                                                                                                          |
| **No AI call the user did not ask for; manual mode is the product**                                                    | CLAUDE.md § AI features                                                                                     | No AI-generated step times, ever, in this feature (§ 9)                                                                                                   |

**Nothing here overrides an earlier decision.** One wording point:
ASSEMBLIES_PLAN says an assembly's hours are "the operation, not the sum of
its parts", and warns that summing components throws away the efficiency of
doing the whole thing at once. Steps are not parts. A step is a piece of the
operation ("strip and terminate"), timed as it is done inside that operation,
so the efficiency is in the step times. The parts cross-check stays as it is
(§ 7, Q6).

## 2. The model

**Two new tables, both additive** (sketch only, no migration written):

- **`labor_steps`**: the shared step library. One row per step:
  - `name`: "Strip and terminate a device";
  - `hours`: decimal(10,4), **NULLABLE, no default**. NULL means not set; 0 is
    a real answer. Shown in minutes.
  - `unit`: what one count means ("each", "per cable end", "per 10 ft");
  - `reasoning`: the short text that says how the time was built (§ 9);
  - `isExampleHours`: TRUE on a shipped time;
  - `userId` / `baselineId`, **exactly the materials pattern**: a NULL
    `userId` is shipped and re-stamped from `server/seed/laborSteps.ts` on
    boot; a shop's edit FORKS it to a row with its `userId`, and the
    re-stamp is scoped `isNull(userId)` so it can never touch the fork
    (`server/seedPreservesUserPrices.test.ts` is the pattern to copy);
  - retire, never delete (`isActive`), like materials.
- **`assembly_labor_steps`**: `assemblyId`, `laborStepId` (the SHIPPED step's
  id, resolved to the company's fork at read time, the same
  `resolveMaterial` path materials use), `count` (decimal, default 1),
  `sortOrder`.

**What a step can be: two kinds, one table.**

- **A timed step**: a time per count. "Mount a new-work box: 4 min each".
- **A part step**: no time of its own; it reads the hours of a MATERIAL
  LINE in the same assembly × that line's quantity. "Pull the cable: the
  25 ft of 12/2 NM-B in this recipe × the cable's own hours per foot". That
  is how the cable inside an assembly uses the SAME number a traced run
  uses (§ 6d). Stored as `laborStepId` pointing at a shipped "from the part"
  step plus `materialLineId`; the step has no `hours`.

Everything else (labor rate, modifiers, productivity, overhead) is untouched.

## 3. Which hours price — ONE function

`assemblyHoursSource(assembly, steps)` in `shared/` (beside
`shared/assemblyHours.ts`, which it calls). It returns which number prices
and why, and **every reader goes through it**, the same rule as
`assemblyHours` (a dozen files once read the column directly; that is how a
NULL became a silent 0).

| Typed `baseLaborHours` | Steps listed     | Hours that price | Tag                                                            | Quiet line beside it                               |
| ---------------------- | ---------------- | ---------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| set                    | none             | typed            | "Example hours" if the typed value is shipped (today's rule)   | parts cross-check, as today                        |
| set                    | all timed        | **typed**        | as above                                                       | "Steps add to 0.51 h" — never a warning, never red |
| set                    | any step not set | **typed**        | as above                                                       | "Steps: 4 of 6 timed"                              |
| NULL                   | all timed        | **step total**   | "Example hours" while any step used is a shipped example (§ 4) | the steps, under More options                      |
| NULL                   | any step not set | **NOT SET**      | —                                                              | "Hours not set — 4 of 6 steps timed"               |
| NULL                   | none             | NOT SET          | —                                                              | "Hours not set" (today)                            |

A **forcing function**, not a comment: the function returns a union
(`{ source: "typed" | "steps" | "notSet", hours: number | null, ... }`), so a
caller cannot read `hours` without having seen `source`, and its tests sit in
`shared/` where the suite reaches them.

**The snapshot is unchanged in shape.** When a line is added to a bid, the
hours that priced are frozen into `snapshotLaborHours` (plus overhead, through
`snapshotHoursFor`), and `snapshotHoursWereExample` records the tag. A step
edit next week cannot move that line.

## 4. "Example hours" and accepting them

- Every **shipped** step time is an example (`labor_steps.isExampleHours`).
- An assembly priced by its steps shows **"Example hours"** while **any step
  it uses** still carries a shipped example time. Same tag, same places:
  the shop's bid screen only, never the customer quote; the print/send
  warning counts it like any example-hours line.
- **Accepting** clears it, in either of two ways:
  1. **Edit a step's time.** It forks the step (the shop's own row), so its
     example flag is gone. That is today's rule for every example number.
  2. **"Use these times"** on the Steps library: one button that forks every
     shipped step the shop uses, unchanged, as its own. It is an explicit
     acceptance with nothing typed, the same shape as accepting the starter
     markup bands (`material-markup.md` D2/D6). It says how many steps and
     how many assemblies it affects before it runs.
- **Typing an assembly's hours** is also acceptance, of that assembly only,
  because the typed number wins (§ 3).

## 5. Shared steps — what an edit reaches

- Editing a step re-totals **every assembly of that company that uses it**,
  live, because the total is computed, not copied.
- **It never moves a priced bid line**: the line's hours are frozen at add
  time (§ 3).
- Because one edit reaches many assemblies, the step editor shows **"Used by
  14 assemblies"** with the yellow-triangle `CompanyDefaultNotice`, the
  company-default warning pattern, and **only there**. A per-assembly edit
  (its counts, its typed hours) is a local edit and carries no notice.
- A shipped step edited by BidRidge (a seed change) reaches every shop that
  has NOT forked it, on the next boot, like a shipped material. A fork is
  never touched.

## 6. How it fits the rules already decided

**a. "Not set" never shows as 0.** A step with NULL time is a gap, so the
total is NOT SET, with the count of timed steps beside it. A partial sum is
never priced: it would understate every line, and a missing hour is worse
than a missing price because the rate multiplies it (`ASSEMBLIES_PLAN.md`
§ "What must come with it" 1). A step whose time is a typed 0 is an answer
and counts.

**b. Difficulty stays on the bid, added not multiplied.** Steps make the
base hours of normal work. Height, retrofit, tight space and the rest stay
job-condition modifiers on the bid, summed and applied once:
`(base + overhead) × (1 + Σ modifiers) × (1 + productivity)`. **No step
carries a difficulty, a multiplier or a "difficult" variant.** That would be
the difficulty-tier field ASSEMBLIES_PLAN rules out, through another door.

**c. Overhead stays separate.** Layout, material handling, testing the
circuit as a whole, cleanup and the walk back to the van belong to
`overheadLaborHours`, added once. Shipped steps describe hands-on-the-work
time only, and their reasoning says so. That is most of the gap between
the draft step totals and today's typed hours (§ 11, Q2).

**d. Drops and runs keep their own hours.** A traced run, a drop or a
vertical is priced from its raceway and conductor materials' own labor
units (`materials.laborHours`, field bends on `fieldBendLaborHours`). **No
run, drop or vertical ever reads a step.** In the other direction, the cable
an assembly carries in its own recipe (25 ft of 12/2 NM-B on a duplex) is
priced by a PART step that reads that cable's own per-foot hours (§ 2), so
"NM-B hours per foot" is one number serving runs and assemblies alike, never
maintained twice.

**e. One labor rate per assembly.** Steps carry no role. The assembly's
`laborRateId` prices all of its hours, as today.

## 7. Screens — simple by default

- **Assembly editor:** unchanged by default. One hours field, as today.
  - Under **"More options"**: **"Build hours from steps"**, a list of steps,
    each with a count, its time in minutes, and its reasoning on a tap. Add
    a step from the library by name; the cable step is offered for each
    cable or raceway line in the recipe.
  - The **quiet line** beside the hours field: "Steps add to 0.51 h" or
    "Steps: 4 of 6 timed". Grey text, no icon, no colour, never a warning
    (§ 3). The existing parts cross-check stays where it is; see Q6 for
    whether both show.
- **Steps library:** a `?view=steps` tab of the Assemblies screen, **not a
  new sidebar item** (the route model folds screens into tabs;
  `client/src/lib/appRoutes.ts`). Shows the common steps, with the rest
  behind one "Show all"; a shop's own steps are always visible (CLAUDE.md
  § "Customization available").
- **Bid screen:** nothing new. A line priced from step hours carries
  "Example hours" exactly like any other example-hours line.

**The two tests for a new feature (CLAUDE.md):** somebody who never opens
the library types hours or leaves them not set, and nothing changes for
them. Somebody with a complete step library gets every assembly priced
without typing an hour. Neither path is pushed toward the other.

## 8. Build order and data (sketch, for whoever builds it)

1. **Additive migration:** the two tables, all new columns nullable.
   Nothing reads them yet, so per CLAUDE.md § "THREE STEPS" this is step 1
   and is safe to apply first. **There is no step 3 (no backfill):**
   nothing existing changes meaning, since an assembly with no steps prices
   exactly as today.
2. `shared/assemblyHoursSource.ts` with its tests; every reader of assembly
   hours switched to it in the same change.
3. The seed: `server/seed/laborSteps.ts` (the § 10 library) and step lists on
   the drafted starters (§ 11). These starters ship **with their typed
   shipped hours cleared**, or the typed number wins and the steps never
   show (Q7). A seed test fails if a shipped starter has both.
4. Screens (§ 7), then **looked at, at the size they ship** (CLAUDE.md:
   "a layout change is not verified until somebody has looked at it"),
   including that "Steps add to" is grey and quiet, and that "not set"
   never renders as 0 min.

**Tests that must exist, each red without its code:**

- one step not set means a total of NOT SET (not the sum of the rest);
- typed hours win over steps, whatever the steps say;
- a step edit re-totals the assembly, and a bid line added before it does
  not move;
- the seed's re-stamp never touches a forked step (copy
  `seedPreservesUserPrices.test.ts`);
- a part step reads the material's `laborHours`, and a NULL there makes the
  total not set;
- `snapshotHoursWereExample` is TRUE for a line priced from any shipped step
  time, and FALSE after "Use these times".

## 9. Where the times come from — and where they never come from

- **Never** from NECA, RSMeans, or any published labor table: not copied,
  not paraphrased, not "adjusted from". No shipped step cites one, and no
  shipped number is derived from one.
- **Never** from an AI call (CLAUDE.md § AI features). These drafts were
  written by reasoning through the physical work; they are not a model's
  output shipped as data, and the app never generates a step time.
- **Built from the motions:** every shipped step's `reasoning` field says
  what the time covers, in plain motions (hold, drive two nails, check
  flush). That lets the owner disagree with a specific motion rather than
  with a bare number, and lets a shop see what it is accepting.
- **The owner owns the final numbers.** § 10–11 are drafts to be changed
  through the seed file, the same way the pricing sheets are.

## 10. Draft step library (times in minutes; hands-on work only, no overhead)

Assumes one electrician, new work in open framing (residential) or metal
studs and lay-in ceiling (commercial), material at hand, a normal ladder.
Retrofit, height and the rest are modifiers (§ 6b).

| Step                                                   | Unit          | Min | Reasoning (the motions)                                                                                                                                                                               |
| ------------------------------------------------------ | ------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S01** Mount a new-work box (nail-on)                 | each          | 4   | measure and mark height (1); hold, drive two nails, check set-back for the drywall (2); knock out the openings needed (1)                                                                             |
| **S02** Mount a fan-rated box with brace               | each          | 8   | as S01, plus fitting and screwing the brace between joists (4)                                                                                                                                        |
| **S03** Prepare a cable end at a box                   | per cable end | 2   | cut to length, strip the sheath, push in, leave the tails folded for trim                                                                                                                             |
| **S04** Make up the grounds                            | each box      | 2   | strip, splice grounds with a pigtail, fold back                                                                                                                                                       |
| **S05** Strip and terminate a device                   | each          | 4   | strip three conductors, form hooks or back-wire, tighten three screws, the ground screw                                                                                                               |
| **S06** Extra: 3-way / 4-way / interconnect conductor  | each          | 3   | identify the travelers or interconnect, one more termination, keep the colours straight                                                                                                               |
| **S07** Extra: GFCI                                    | each          | 3   | find line vs load, a bulkier device to fold in, press test and reset                                                                                                                                  |
| **S08** Extra: device with leads (dimmer, sensor)      | each          | 2   | splice the pigtail leads with wire nuts instead of screw terminals                                                                                                                                    |
| **S09** Fold in and set the device                     | each          | 2   | fold conductors, screw the device in square, check flush                                                                                                                                              |
| **S10** Plate or cover                                 | each          | 1   | one or two screws                                                                                                                                                                                     |
| **S11** Test                                           | each          | 1   | plug tester or operate it once                                                                                                                                                                        |
| **S12** Mount a 4" or 4-11/16" square box (bracket)    | each          | 5   | stud bracket on, box on bracket, set depth for the ring, two screws each                                                                                                                              |
| **S13** Install a mud ring                             | each          | 1   | two screws                                                                                                                                                                                            |
| **S14** Cut and connect MC at a box                    | per cable end | 4   | cut the armour, red-head, connector on, locknut tight                                                                                                                                                 |
| **S15** Ground pigtail to the box                      | each          | 1   | green screw in the tapped hole, splice                                                                                                                                                                |
| **S16** Set a canless wafer                            | each          | 8   | locate and mark (1); cut the hole (2); connect at the wafer's junction box (4); push in, clips set (1)                                                                                                |
| **S17** Mount a fixture bracket                        | each          | 3   | two screws to the box, check level                                                                                                                                                                    |
| **S18** Hang a surface fixture                         | each          | 12  | splice three conductors, hold and fasten the canopy, lamp or lens on                                                                                                                                  |
| **S19** Assemble and hang a ceiling fan                | each          | 45  | unbox; assemble downrod and canopy; hang and splice; blades and light kit; run it and balance                                                                                                         |
| **S20** Set a lay-in fixture in the grid               | each          | 10  | lift the tile, set the fixture, square it in the grid, tile back                                                                                                                                      |
| **S21** Hang a support wire to structure               | each          | 4   | up the ladder, fasten to deck or joist, wrap three turns, attach to the fixture or box                                                                                                                |
| **S22** Grid clip                                      | each          | 0.5 | snap on, bend the tab                                                                                                                                                                                 |
| **S23** Connect a fixture whip (both ends)             | each          | 8   | connector at the fixture, splice; connector at the box, splice                                                                                                                                        |
| **S24** Install a troffer retrofit kit                 | each          | 25  | open the fixture; remove lens, lamps, ballast and sockets; mount the kit; splice the driver; close                                                                                                    |
| **S25** Convert a 2-lamp fixture to ballast bypass     | each          | 25  | remove the ballast; change four lampholders to non-shunted; rewire line to the sockets; label the fixture; lamps in                                                                                   |
| **S26** Mount and connect an exit or emergency unit    | each          | 15  | canopy to the ring, splice, connect the battery, hang the unit, press test                                                                                                                            |
| **S27** Hang a surface or suspended strip              | each          | 15  | mark and fasten (or hang on two wires), splice, lamp or lens                                                                                                                                          |
| **S28** Remove a fixture and make it safe              | each          | 12  | lift the tile or drop the fixture, disconnect, cap the conductors, out of the way                                                                                                                     |
| **S29** Remove a device and blank it                   | each          | 5   | plate and device off, cap the conductors, fold in, blank plate on                                                                                                                                     |
| **S30** Open and close the panel cover                 | per visit     | 4   | screws out, cover off and back on                                                                                                                                                                     |
| **S31** Snap in a breaker                              | each          | 2   | knock out the filler, snap the breaker on                                                                                                                                                             |
| **S32** Land a 1-pole circuit and label it             | each          | 6   | route in the gutter, strip, land hot and neutral, ground to the bar, write the directory                                                                                                              |
| **S33** Land a 2-pole circuit and label it             | each          | 9   | as S32 with a second hot, heavier conductors                                                                                                                                                          |
| **S34** Mount a box on an independent support          | each          | 3   | box to the wire clip, level it                                                                                                                                                                        |
| **S35** Make up a splice box                           | each          | 4   | splice through, four wire nuts, fold in                                                                                                                                                               |
| **S36** Set a smoke or CO head and test                | each          | 3   | twist the head on, pull the tab, press test                                                                                                                                                           |
| **S37** Frame in a bath fan housing                    | each          | 20  | locate between joists, fasten the housing, knock out for the cable                                                                                                                                    |
| **S38** Duct and roof cap for a bath fan               | each          | 45  | cut the roof, flash and seal the cap, run the flex duct, clamp both ends                                                                                                                              |
| **S39** Install a siding mounting block                | each          | 10  | cut the siding opening, set and fasten the block, seal                                                                                                                                                |
| **S40** In-use cover                                   | each          | 3   | gasket, base, lid, screws                                                                                                                                                                             |
| **S41** Prepare a large cable end (#8 and up)          | per cable end | 4   | stiffer sheath, more to form, bigger connector                                                                                                                                                        |
| **S42** Terminate a large receptacle (#6, 4-wire)      | each          | 10  | strip four heavy conductors, form them, torque four lugs                                                                                                                                              |
| **S43** Install a range or dryer cord on the appliance | each          | 10  | remove the terminal cover, strain relief, three or four terminals, cover back                                                                                                                         |
| **S44** Mount an outdoor disconnect                    | each          | 15  | locate, level, four fasteners into the wall, knock out top or bottom                                                                                                                                  |
| **S45** Land conductors in a disconnect                | each          | 8   | line and load sides, ground                                                                                                                                                                           |
| **S46** Install a condenser whip (both ends)           | each          | 12  | connector into the disconnect and into the unit, land at both                                                                                                                                         |
| **S47** Seal a penetration with duct seal              | each          | 2   | press it in around the conductors                                                                                                                                                                     |
| **P1** Cable in this recipe (PART step)                | from the part | —   | reads the cable line's own hours per foot (§ 2, § 6d). Draft for the owner's labor sheet: **NM 14–10 AWG 5 min / 10 ft**; **NM #8 and up 9 min / 10 ft**; **MC 12/2 5 min / 10 ft** (reasoning below) |

**Draft cable units, with the reasoning** (they belong on the CABLE material,
not on a step):

- **NM 14–10 AWG, 5 min per 10 ft:** at 16" centres, 10 ft is seven or eight
  studs; a hole each with a right-angle drill is about 20 s (2.5 min); pull
  through and keep it from twisting (1 min); two staples, one within a foot of
  the box (1 min).
- **NM #8 and up, 9 min per 10 ft:** larger holes take an auger, the cable is
  stiff and pulls hard through each one, and it needs more staples.
- **MC 12/2, 5 min per 10 ft:** through punched metal studs, so no drilling,
  but a support every 6 ft and within a foot of the box.

## 11. Draft step lists for the top 30 starters

The 30 are the top 15 of each list in `references/top-assemblies-draft.md`,
with recipes read from the seed on 2026-10-09 (`local-dev` `243d42d`). If
a recipe has changed since, re-read it before adjusting a step list. Cable
minutes use the § 10 draft units. **Typed now** = the shipped typed hours
today (NULL = not set).

Where a starter has typed hours today, the step total runs **22–38% below
them** (DV4 22%, LT2 22%, DV5 29%, DV1 32%, DV3 37%, DV2 38%), except LT1,
which matches (0.62 h against 0.6). That is expected: the steps exclude
overhead (§ 6c), and the typed starter hours were set as all-in figures. The owner decides whether that time goes into
`overheadLaborHours` or into the steps (Q2).

### Residential

| #   | Starter (ref)                               | Steps × count (minutes)                                                                     | Total min | Total h | Typed now |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------- | --------- | ------- | --------- |
| 1   | Duplex receptacle standard (DV1)            | S01 4 · P1 25 ft NM 12.5 · S03×2 4 · S04 2 · S05 4 · S09 2 · S10 1 · S11 1                  | 30.5      | 0.51    | 0.75      |
| 2   | Single-pole switch (DV4)                    | S01 4 · P1 20 ft NM 10 · S03×2 4 · S04 2 · S05 4 · S09 2 · S10 1 · S11 1                    | 28        | 0.47    | 0.6       |
| 3   | Wafer LED downlight, 6" (LT7)               | P1 20 ft NM 10 · S03×2 4 · S16 8 · S11 1                                                    | 23        | 0.38    | not set   |
| 4   | Wafer LED downlight, 4" (LT8)               | as LT7                                                                                      | 23        | 0.38    | not set   |
| 5   | GFCI receptacle (DV2)                       | DV1 + S07 3                                                                                 | 33.5      | 0.56    | 0.9       |
| 6   | 3-way switch (DV13)                         | S01 4 · P1 20 ft NM 10 · S03×2 4 · S04 2 · S05 4 · S06 3 · S09 2 · S10 1 · S11 1            | 31        | 0.52    | not set   |
| 7   | Surface-mount ceiling fixture (LT1)         | S12 5 · P1 20 ft NM 10 · S03×2 4 · S04 2 · S17 3 · S18 12 · S11 1                           | 37        | 0.62    | 0.6       |
| 8   | Dimmer switch (DV5)                         | DV4 + S08 2                                                                                 | 30        | 0.50    | 0.7       |
| 9   | Combination smoke/CO detector (RS9)         | S01 4 · P1 20 ft NM 10 · S03×2 4 · S04 2 · S05 4 · S06 3 · S36 3                            | 30        | 0.50    | not set   |
| 10  | Ceiling fan standard (LT2)                  | S02 8 · P1 20 ft NM 10 · S03×2 4 · S04 2 · S19 45 · S11 1                                   | 70        | 1.17    | 1.5       |
| 11  | Dedicated 20A receptacle (DV3)              | DV1 with 35 ft (P1 17.5) = 35.5 · S30 4 · S31 2 · S32 6                                     | 47.5      | 0.79    | 1.25      |
| 12  | Bath exhaust fan wiring (RS7)               | S37 20 · S38 45 · P1 20 ft NM 10 · S03×2 4 · S04 2 · S05 4 · S11 1                          | 86        | 1.43    | not set   |
| 13  | Outdoor GFCI receptacle, in-use cover (DV8) | S39 10 · S01 4 · P1 25 ft NM 12.5 · S03×2 4 · S04 2 · S05 4 · S07 3 · S09 2 · S40 3 · S11 1 | 45.5      | 0.76    | not set   |
| 14  | Range receptacle, 50A (RS1)                 | S12 5 · P1 40 ft 6/3 NM 36 · S41×2 8 · S42 10 · S10 1 · S30 4 · S31 2 · S33 9 · S43 10      | 85        | 1.42    | not set   |
| 15  | HVAC condenser disconnect + whip (MH1)      | S44 15 · P1 35 ft 10/2 NM 17.5 · S03×2 4 · S45 8 · S46 12 · S47 2 · S30 4 · S31 2 · S33 9   | 73.5      | 1.23    | not set   |

### Commercial

| #   | Starter (ref)                                 | Steps × count (minutes)                                                            | Total min | Total h | Typed now |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------- | --------- | ------- | --------- |
| 16  | 2x4 LED troffer, lay-in (LT19)                | S20 10 · S21×2 8 · S22×4 2 · S23 8 · S11 1                                         | 29        | 0.48    | not set   |
| 17  | Duplex receptacle, MC (DV20)                  | S12 5 · S13 1 · P1 25 ft MC 12.5 · S14×2 8 · S15 1 · S05 4 · S09 2 · S10 1 · S11 1 | 35.5      | 0.59    | not set   |
| 18  | Troffer LED retrofit kit (DR7)                | S24 25 · S11 1                                                                     | 26        | 0.43    | not set   |
| 19  | 4 ft fluorescent to LED, ballast bypass (DR8) | S25 25 · S11 1                                                                     | 26        | 0.43    | not set   |
| 20  | Single-pole switch, MC (DV26)                 | S12 5 · S13 1 · P1 20 ft MC 10 · S14×2 8 · S15 1 · S05 4 · S09 2 · S10 1 · S11 1   | 33        | 0.55    | not set   |
| 21  | Emergency light / exit combo (LT28)           | S12 5 · S13 1 · P1 25 ft MC 12.5 · S14×2 8 · S26 15                                | 41.5      | 0.69    | not set   |
| 22  | Exit sign (LT27)                              | as LT28                                                                            | 41.5      | 0.69    | not set   |
| 23  | Demo lay-in fixture, make safe (DR3)          | S28 12 · S10 1                                                                     | 13        | 0.22    | not set   |
| 24  | Junction box above lay-in ceiling (MS2)       | S21 4 · S34 3 · S15 1 · S35 4 · S10 1                                              | 13        | 0.22    | not set   |
| 25  | GFCI receptacle, MC (DV21)                    | DV20 + S07 3                                                                       | 38.5      | 0.64    | not set   |
| 26  | 2x2 LED troffer, lay-in (LT20)                | as LT19                                                                            | 29        | 0.48    | not set   |
| 27  | Wall occupancy sensor, MC (DV29)              | DV26 + S08 2                                                                       | 35        | 0.58    | not set   |
| 28  | Demo device, blank plate (DR2)                | S29 5                                                                              | 5         | 0.08    | not set   |
| 29  | 4 ft LED strip, surface / suspended (LT22)    | S27 15 · S21×2 8 · S23 8 · S11 1                                                   | 32        | 0.53    | not set   |
| 30  | Breaker add, single-pole (PG7)                | S30 4 · S31 2 · S32 6                                                              | 12        | 0.20    | not set   |

Notes on reading the lists:

- **Counts come from the recipe.** Two cable ends per assembly (S03 × 2,
  S14 × 2): each recipe carries one cable segment, and both its ends are
  prepared. The other end is at the previous box, which is counted in that
  box's own recipe, so neither box counts a shared end twice.
- **DV3, RS1, MH1, PG7 land a circuit in the panel** (S30–S33) because their
  recipes carry the breaker. The other device starters do not: their home
  run is a traced run or another assembly.
- **DR8, LT19, LT20, LT22:** the whip and the grid wires are in the recipe,
  so their steps are here. The circuit feeding the whip is not.

## 12. Questions for the owner — each with a suggested answer

1. **Should the cable inside an assembly take its hours from the cable's own
   hours per foot (one number, shared with traced runs), or from a step with
   its own time?**
   _Suggested:_ the cable's own. One number for "NM-B per foot" serves runs
   and assemblies, so a shop that corrects it corrects both (§ 6d). The § 10
   cable units go on the labor sheet, not on a step.
2. **Should layout, material handling and cleanup go into
   `overheadLaborHours` or into steps?** The step totals run 22–38% below
   today's typed starter hours (§ 11), and that is roughly the gap.
   _Suggested:_ `overheadLaborHours`, as already decided: flat per
   assembly, added once, never scaled as a step would be. The owner's
   numbers there: start at 0.10–0.15 h on device starters and adjust.
3. **Typed hours always win, and the step total is only a grey line,
   never a warning. Confirm?**
   _Suggested:_ yes, exactly as ASSEMBLIES_PLAN already says for parts; a
   gap between them is information, not an error.
4. **Accepting: per step (edit it), all at once ("Use these times"), or
   both?**
   _Suggested:_ both. Editing a step accepts that step; "Use these times"
   accepts every shipped step the shop uses in one press, after saying how
   many steps and assemblies it touches.
5. **Minutes or hours on screen?**
   _Suggested:_ minutes on steps (nobody thinks of a plate as 0.0167 h),
   hours on the assembly and the bid, as today.
6. **Show both cross-checks (parts and steps) beside the hours, or only
   one?**
   _Suggested:_ steps when the assembly has steps, otherwise parts. One
   quiet line, not two.
7. **For the 30 drafted starters, ship the STEPS and clear today's typed
   hours (so the steps show), or keep the typed hours and the steps only as
   a cross-check?** A starter with both shows the typed number; the steps
   would never price.
   _Suggested:_ ship the steps once the owner has adjusted them, and clear
   the typed shipped hours on those 30. The other starters keep the
   assembly-hours sheet. **Never both on one starter**, with a seed test
   that enforces it.
8. **Old-work (retrofit) assemblies: separate steps ("fish cable in a
   finished wall"), or the plain steps plus the Retrofit modifier?**
   _Suggested:_ the plain steps plus the Retrofit modifier. A second set of
   steps for the same job would make the modifier count it twice. Only work
   that really is different (cutting in an old-work box) gets its own step.
9. **Should steps carry a labor role, for work a helper does?**
   _Suggested:_ no, not now. One rate per assembly, as today (§ 6e). If it
   is wanted later, it is a column on the step and a second line on the bid,
   and it needs its own plan.
10. **Should the drafted times stand at all, or should they ship as
    "not set" with only the step NAMES, for each shop to time?**
    _Suggested:_ ship them as example times, adjusted by the owner. "Not
    set" everywhere gives a new shop nothing to react to, and the example
    tag already keeps a shipped number from passing as the shop's own.
