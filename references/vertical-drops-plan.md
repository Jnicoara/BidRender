# Vertical drops — plan (Track B, 2026-10-05)

**Status, 2026-10-05 (later the same day): the owner answered § 10, and
the code-only part is BUILT** (§ 8 says what, with tests). Two parts wait
for Track A's columns, listed in § 7: the per-sheet run height and the
assembly's mounting height. No migration was written by Track B.

**Owner's answers (2026-10-05):**

| Q   | Answer                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------- |
| a   | A run ending on an EXISTING device: **option C** — price the drop, one-click "Leave it off", no column.                 |
| b   | **Yes — run height per sheet.** Overrides overhaul § 6 "No per-area heights" (recorded there too). One column, Track A. |
| c   | **Yes — assemblies carry the device's mounting height.** One column, Track A.                                           |
| d   | Relocates: **wait** until remove/relocate labor pricing is decided.                                                     |

## 0. Read this first: most of this already exists

The request that started this plan said drops "are not counted today, so runs
underbid wire and conduit". **That is not what the code does.** Measured
2026-10-05 against `track-b` @ `b14e665`:

- **Run-end verticals are counted and priced** (Phase 5):
  `shared/takeoffHeights.ts`, `server/runVerticals.ts`,
  `shared/takeoffQuantities.ts` `quantitiesForRun`. They reach bid lines
  (`server/runTypeFootageCore.ts`), totals, the materials list, the export
  and labor.
- **Per-mark drops set on a count are counted and priced** (Phase 8,
  migrations 0094/0095): `shared/groupDrops.ts`, `db.loadGroupDrops`. They
  reach the bid even with no traced run (`server/runTypeFootage.ts`).
- **Makeup and extra are applied on top of both**
  (`shared/runExtras.ts`, decided in `track-b-held-migrations-plan.md` § 7).

**Why it looks uncounted:** both paths count nothing until somebody answers
two things — a **run height** (the distribution height; the gate) and **what
is at each end** (a run's From/To kind, or a count's "Add a drop to each
one"). Nothing is preset. A bid nobody configured really does underbid, but
it says so: "Drop heights not set — drops not counted" (top-bar chip,
`JobHeightsChip.tsx`), "No vertical footage is in these numbers. N runs are
counted flat only" (`RunsPanel.tsx`). That is the decided behavior
(plan-viewer-overhaul § 5d, "the zero has to shout"), not a missing feature.

So this plan is about the **gaps**, which are real and listed in § 1. Where
the request asked for something a recorded decision already rules on, the
decision is cited and the question goes to the owner rather than being
re-decided here (CLAUDE.md § "Where decisions live").

### Decisions this plan builds on (do not re-open without saying why)

| Decision                                                                        | Where                                    |
| ------------------------------------------------------------------------------- | ---------------------------------------- |
| Verticals come from mounting heights applied automatically, not typed feet      | plan-viewer-overhaul § 2.4               |
| Called "distribution height" (on screen "run height"), never "ceiling height"   | overhaul § 2.4, § 6                      |
| **No per-area heights.** Per-run override is enough                             | overhaul § 6 (≈ line 4421)               |
| Run end device type is picked by the user, never guessed from a nearby stamp    | overhaul § 6                             |
| A vertical belongs to the run OR the stamp, never both — in the code            | overhaul § 2.4, `stampsClaimedByRuns`    |
| A vertical belongs to the GROUP, not each stamp                                 | overhaul § 6 — **narrowed**, see § 2     |
| A vertical is never folded into the traced length; shown alongside              | overhaul § 5d                            |
| Conduit extra on traced length only; wire extra on everything; makeup wire only | overhaul § 7.1, held-migrations § 7      |
| An unset height is excluded with a named reason, never counted as 0             | `verticalAtEnd`, § 5d                    |
| Only a NEW mark gets a count drop                                               | `markStatus.ts` rule 1, `loadGroupDrops` |
| A mark's own height replaces its count's for that mark's vertical only          | check-my-marks-plan § 10.6               |

## 1. The gaps

1. **A mark's own height is stored nowhere that is read.**
   `takeoff_stamps.mountHeightInches` / `mountHeightSource` (0098) exist;
   no code reads or writes them (`MARK_HEIGHT_COLUMN = false` in
   `shared/sheetCheckSwitches.ts`). A 54" receptacle on an 18" count drops
   36" too far.
2. **A height read off the plan is shown and thrown away.** `readHeight`
   (`client/src/lib/sheetCheck.ts`) parses `54"`, `+18`, `48" AFF`, `4'-0"`;
   Sheet Check shows it with "Heights are shown, not saved".
3. **One mark's drop cannot be left off.** `takeoff_stamps.dropExcluded`
   (0098) exists; `groupDrops` does not read it.
4. **Linking a run end to a mark does not say what is there.** The "Link"
   chip writes `endStampId` and leaves `endKind` alone, because nothing ties
   a mark to a height type. A branch leg started on a mark writes
   `startStampId` with `startKind: null`.
5. **WRONG-NUMBER RISK — a claimed mark can lose its drop entirely.**
   `stampsClaimedByRuns` claims every linked stamp whether or not the run
   counts a vertical at that end. A leg started on a mark (kind null) takes
   the mark's drop OFF its count while the run counts none there. The run
   row says "only one end counted", but the count's number has quietly gone
   down. This is the one gap that makes a number smaller with nothing
   pointing at it, so it goes first.
6. **A run ending on an EXISTING mark prices its drop**, and whether it
   should is the owner's open question (§ 4).
7. **Stale records.** takeoff-spec T17 and R7 still say "Missing";
   overhaul § 5d's heading still says "PLANNED … not built";
   before-beta-checklist cites "0103 `dropExcluded`" (it is 0098). Fixed
   as step 0 of § 8 so the next reader's search lands on the truth.

## 2. Where a height comes from, and which one wins

There are two heights in every vertical: the **run height** at the top and
the **device height** at the bottom. Each has its own chain.

### The device end — nearest wins

| #   | Source                                                  | Stored in                                                                                                                      | Status                               |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1   | This run end's own height (typed on the run)            | `takeoff_runs.startHeightInches/endHeightInches`                                                                               | built                                |
| 2   | **This mark's height, typed**                           | `takeoff_stamps.mountHeightInches`, source `typed`                                                                             | column only — build                  |
| 3   | **This mark's height, read from the plan and accepted** | same, source `read`                                                                                                            | column only — build                  |
| 4   | The count's height ("Height for this count")            | `takeoff_groups.dropHeightInches`                                                                                              | built (count path)                   |
| 5   | This job's height for the type                          | `bid_mounting_heights`                                                                                                         | built                                |
| 6   | The company's height for the type                       | `takeoff_mounting_heights`                                                                                                     | built                                |
| 7   | The shipped default for the type                        | `SHIPPED_HEIGHT_TYPES` (receptacle 18", switch 48", disconnect 60", floor box 0, underground −18; panel and ceiling box unset) | built                                |
| —   | None of the above                                       | —                                                                                                                              | **not counted, amber, named reason** |

Rows 2–4 apply when the end is a mark (a count drop, or a run end linked to
a mark). Today's chain is 1 → 5 → 6 → 7 for runs and 4 → 5 → 6 → 7 for
counts; this plan inserts 2 and 3 and lets a linked run end reach 4.

**Why typed beats read:** a person looked at a typed height; a read one is
text that happened to sit within 16 pt of a mark (`WORD_REACH`), and the
nearest text is not always the mark's own note. **A read height is never
applied silently.** Sheet Check offers it ("Use 54" from the plan"), and
only an accepted one is written, as `read`. That also keeps the AI rule
whole: `readHeight` is plain code, but even plain code reading a drawing
gets the person's yes before it moves a number.

**Why the mark beats the count:** check-my-marks-plan § 10.6 already
decided it ("replaces its count's for that mark's vertical only"). This
**narrows** overhaul § 6's "a vertical belongs to the GROUP, not each
stamp": the group still holds the height thirty receptacles share; a mark
holds one only when it is different. When this is built, overhaul § 6 gets
a line saying so (both files, CLAUDE.md).

**What "device type" means at a mark.** A mark's height TYPE (receptacle,
switch…) comes from its count's `dropKind`. Nothing ties a device family,
an assembly or a legend symbol to a height type today (§ 7 option B).

### The run end — the gate

Run height resolves run → job → company (`resolveDistributionHeight`) and
has **no shipped default on purpose**: it is the one question every job has
to answer, and a guessed 10'-0" would price every drop on a 14' warehouse
short with nothing on screen to say so.

**Plan notes for the run height** ("ALL CONDUIT RUN AT 12'-0" AFF") are not
read today. Out of scope here; if wanted, it follows the same rule as a mark
height: offered, never applied silently.

### Per-sheet run height — DECIDED 2026-10-05: yes (waits on Track A)

The request asked for "a ceiling/deck height per sheet or per area".
**Overhaul § 6 had decided "No per-area heights. Per-run override is
enough"**, and "ceiling height stays out of the model". **The owner
overrode the first half for SHEETS on 2026-10-05** (answer b): a
multi-storey job where floor 1 runs at 12' and floor 2 at 10' was a
per-run override on every run of one floor. The reason is that case.
Per-AREA heights and "ceiling height" stay out. Overhaul § 6 carries a line
saying so.

Once A adds the column (§ 7), the run height chain becomes
**run → sheet → job → company**, still with no shipped layer, and a
sheet's own height is set on the sheet row with the same `HeightFields`
control ("follows the job" when empty).

## 3. How a drop adds to a run

Unchanged from what is built, written down here so the test plan has one
place to point:

- A run has two ends. **Each end that is a device or a panel** (its kind is
  a height type, not "run height") adds `|run height − device height|` of
  vertical. A tee end adds none (D20). An end at "run height" adds none.
- **Conduit** = (flat + vertical) × (1 + conduit extra %). **Changed
  2026-10-05 by the owner:** it was flat × (1 + %) + vertical — waste on the
  flat length only (overhaul § 7.1). Conduit waste now covers the drops, the
  same base wire waste uses, on traced runs and count drops alike.
- **Wire, per conductor** = (flat + vertical) × (1 + wire extra %) +
  makeup at each end. **Makeup still applies, on top, after the vertical** —
  18" per conductor at a device box, 5' at a panel (owner, held-migrations
  Q2), resolved per kind then class (`resolveMakeup`). Cable: wire % on all
  of it, one makeup tail per end (Q3).
- **Labor** is on installed footage — flat + vertical + makeup on wire — not
  on the extra (`laborQty`, Q5).
- **A count drop** is the same arithmetic for one vertical per new mark:
  conduit waste (since 2026-10-05; none before), wire waste, makeup at the
  device end, no fittings (labelled, Q8).
- **Never both.** A mark a run end claims is left out of its count's drops.
  Gap 5 changes WHEN a claim counts — see § 8 step 1.

### The known-answer run, line by line (asked 2026-10-05)

The owner worked the conduit by hand as 40 + 4 + 8.5 = **52.5 ft** and
asked why § 9 said 54.5. **Both are right; they are different
quantities.** 52.5 is conduit INSTALLED. 54.5 was conduit BOUGHT under
the old rule, which put the conduit waste on the FLAT length only
(overhaul § 7.1). **The owner then changed the rule the same day:** conduit
waste covers flat + drops, like wire waste. Every line, as the code now
computes it (`server/verticalDropsKnownAnswer.test.ts`, green):

**Conduit**

| Step                           | Working         | Feet      |
| ------------------------------ | --------------- | --------- |
| Flat (traced)                  | —               | 40.0      |
| Drop at the panel              | (120 − 72) ÷ 12 | 4.0       |
| Drop at the receptacle         | (120 − 18) ÷ 12 | 8.5       |
| **Conduit installed**          | 40 + 4 + 8.5    | **52.5**  |
| Conduit waste, on flat + drops | 52.5 × 5 %      | 2.625     |
| — kept to the cent (half up)   |                 | 2.63      |
| **Conduit bought**             | 52.5 + 2.63     | **55.13** |

52.5 × 1.05 = 55.125 exactly; every footage is kept to the hundredth of a
foot (`round2`), and the waste is rounded before it is added, so the bid
reads **55.13 ft**. Under the old rule it read 2.00 waste and 54.50 bought.

Makeup is wire only, so conduit gets none.

**Wire** — 3 insulated conductors + the run's 1 shared ground = 4 wires

| Step                                    | Working      | Feet      |
| --------------------------------------- | ------------ | --------- |
| Wire down the run and both drops        | 4 × 52.5     | 210.0     |
| Makeup at the panel (60" per wire)      | 4 × 5.0      | 20.0      |
| Makeup at the receptacle (18" per wire) | 4 × 1.5      | 6.0       |
| **Wire installed**                      | 210 + 20 + 6 | **236.0** |
| Wire extra (waste), on flat + drops     | 210 × 10 %   | 21.0      |
| **Wire bought**                         | 236 + 21     | **257.0** |

Wire extra is on the wire run (flat + vertical), not on the makeup; makeup
is added, never multiplied. Per conductor: 52.5 × 1.10 + 5.0 + 1.5 =
64.25, × 4 = 257.0 — the same answer by § 9's route.

## 4. A run that ends on an EXISTING mark — DECIDED 2026-10-05: option C

**The owner chose C** (answer a). BUILT: a run end LINKED to a mark marked
existing prices its drop, and the run row says "Ends on an existing device
— drop priced. [Leave it off]"; leaving it off sets that end to run height
(`endKind = distribution`) and the row then says "drop left off. [Price
it]". No column. Recorded in `references/owner-questions.md` § 3 too.

Limit worth knowing: this applies to an end LINKED to the mark (the Link
chip, or a leg started on it). A run that merely ends near an existing
device is not linked, and its end prices whatever its picker says, as
before.

The options as they were laid out:

- **A. Keep pricing the drop, and say so** (the recommendation already on
  file). The pipe and wire down to an old box are new work. The run row
  says "ends on an existing device — drop priced". Risk: a job where the
  existing box is fed from above already, and the estimator wanted no drop.
- **B. Never price a drop at an existing device.** Matches the count path.
  Risk: a bid comes out short wherever new work ties into old, which is
  common on remodels.
- **C. Price it, with a per-end "no drop here" switch.** A, plus a way out
  for the case A gets wrong. The run end already has a way to say "no
  drop": set its end to "run height". So C needs **no new column** — only a
  prompt on the row ("Ends on an existing device. Drop priced — [Leave it
  off]") that writes `endKind = distribution`.
- **D. Ask on the first one, remember for the job.** Heavier; a per-job
  setting would need a column. Listed for completeness.

What all four share, and is not optional: the run row SAYS which happened.
A drop priced or left off at an existing device must never be silent.

## 5. What shows on screen

Mostly built; the additions are marked NEW.

- **On the run row:** flat, vertical, total — the closed row shows the
  arithmetic (§ 5d decision 4), e.g. "40.0 ft flat + 12.5 ft vertical
  (panel 6'-0" → run 10'-0" → receptacle 1'-6")".
- **BUILT — where each end's height came from**, in words, when it is not
  the type default: "Drop 5.50 ft · this mark's height", "· read from the
  plan", "· the count's height" (`heightSourceWords`, runEnds.tsx). A
  height nobody can trace back is a number nobody can check.
- **Amber when a height is unknown**, with the reason and the fix in one
  line: "No drop at the end — no height set for Panel. Set it". Built for
  runs (`uncountedEnds`) and counts ("No drop counted — …").
- **Never silently 0.** An unset height is excluded with a named reason
  (`verticalAtEnd`); 0 is only ever a real height (floor box). A count
  whose type has no height, with some marks at heights of their own, counts
  those and says in amber "2 marks have no drop counted — no height set for
  that type" (`GroupDrop.uncounted`).
- **BUILT — on the selection pill, not a popover** (there is no mark
  popover; the pill is where "Mark as…" already lives): **Height** with the
  shared `HeightFields` control — empty reads "the count's", mixed reads
  "heights differ", "Follow the count" clears it — and **"No drop on
  these" / "Give these a drop"**. `HeightFields` rather than
  `InlineNumberField`, because it is the height control the count row and
  the run ends already use, so the three cannot drift (CLAUDE.md § "Copying
  a layout").
- **Gap 5 needed no warning:** the rule was fixed instead, so a claim that
  counts nothing no longer takes the drop.
- **BUILT — existing-device wording** per option C (§ 4).
- **BUILT — the card says it in words.** "18" × 3 + 1 at its own height =
  31.00 ft", and "1 mark has no drop — left off by hand". The bid-wide
  drops readout says "heights vary by mark" instead of a per-drop length
  when marks differ — "N × one drop" is never shown when it is false.
- **BUILT — Sheet Check offers a read height:** "Use 54"" beside each mark
  a height was read for; only that click writes it (as `read`).
- Wording is "run height" everywhere a person reads it
  (before-beta-checklist: "one setting, six names" is its own cleanup).

## 6. Staleness

Adding a mark height adds a mutation on the Plans screen whose effect lands
in drops, run rows, the count card, the bid totals and the materials list.
Per CLAUDE.md § "A test that calls the server cannot see a screen showing
yesterday's answer": route it through the screen's existing refresh helper
(`client/src/lib/takeoffRefresh.ts`) as a new reason, keyed by BID (a drop
moves bid totals), and on screen: set a mark's height, and look whether the
run row, the card and the total MOVE.

## 7. Columns Track A would need

**For the core of this plan: none.** Gaps 1, 2, 3, 4 and 5 use columns that
already exist (0094/0095, 0098, 0050–0052). Option C in § 4 needs none.

### FOR TRACK A — the two columns the owner asked for (2026-10-05)

| #   | Column                                             | Kind                               | Meaning                                                                                                                                                            |
| --- | -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `bid_pdf_sheets.distributionHeightInches INT NULL` | **ADDITIVE**, nullable, NO default | This sheet's run height. NULL = follows the job. Chain: run → **sheet** → job → company.                                                                           |
| 2   | `assemblies.mountHeightTypeKey VARCHAR(64) NULL`   | **ADDITIVE**, nullable, NO default | The height TYPE this assembly's device mounts at (a key of the heights list: `receptacle`, `switch`, or a company's own). NULL = not said; a count asks, as today. |

- Both are **step 1** of the three-step deploy: no `UPDATE`, no backfill,
  no existing meaning changes. NULL must stay distinguishable from any
  answer, so **no `DEFAULT`**.
- **Why a type KEY on the assembly, not inches:** a height in inches on the
  assembly would be a fourth place a receptacle's height lives, and would
  not move when the company changes its receptacle height. A key resolves
  through the existing chain (job → company → shipped), so it re-prices
  like everything else. A device mounted somewhere unusual is still a
  per-count or per-mark height.
- **Track B after A:** a new count from an assembly with a key starts with
  `dropKind` answered (still editable — both directions, CLAUDE.md); a
  linked run end whose count has no `dropKind` may then use its
  assembly's key. A shipped assembly forks on edit, as now.
  `symbol_links` is NOT asked for: a legend symbol links to an assembly
  and takes its key; a second column would be a second answer to one
  question.

### The options as they were laid out (A and B chosen, D not)

| Option | Column                                             | Kind                           | Why                                                                                                                                                                            |
| ------ | -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A      | `bid_pdf_sheets.distributionHeightInches INT NULL` | ADDITIVE, nullable, no default | Per-sheet run height (§ 2, Q2). Chain becomes run → sheet → job → company. NULL = follows the job.                                                                             |
| B      | `assemblies.heightTypeKey VARCHAR(64) NULL`        | ADDITIVE, nullable, no default | "A receptacle assembly drops at receptacle height" set once in the library, so a new count starts with its drop answered (D3: set once in the assembly). NULL = ask, as today. |
| D      | `bids.existingEndDrop ENUM('price','skip') NULL`   | ADDITIVE, nullable             | Only for § 4 option D.                                                                                                                                                         |

All are step 1 (additive) of the three-step deploy; none rewrites an
existing meaning. Option B needs a fork rule like every shipped-assembly
edit, and a decision on whether `symbol_links` gets the same column (a
legend symbol is more specific than its assembly — pin plan § 6 precedence).

## 8. Build order (Track B, code only)

**BUILT 2026-10-05**, all code, no migration:

| Step | What                                                                                     | Where                                                                                                           | Test                                                                     |
| ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1    | A run end claims a mark's drop only where it counts a vertical (gap 5)                   | `stampsClaimedByRuns`; `loadGroupDrops` passes each end's result                                                | takeoffVerticals + groupDrops (both red with the old rule), markDropsBid |
| 2    | A linked end with no kind takes its count's `dropKind` (not on a quantity trace, D21)    | `endOfRun`, server/runVerticals.ts                                                                              | takeoffVerticals "an end LINKED to a mark"                               |
| 3    | Mark heights read, one order for both paths                                              | `resolveDeviceHeight` (shared/takeoffHeights.ts), used by `endOfRun` and `groupDrops`; drops bucketed by height | groupDrops, takeoffVerticals, markDropsBid                               |
| 4    | `dropExcluded` read; "No drop on these" on the pill                                      | `groupDrops`, `takeoffStamps.setDropExcluded`                                                                   | groupDrops, markDropsBid                                                 |
| 5    | Typed height on the pill; read height accepted from Sheet Check; `MARK_HEIGHT_COLUMN` on | `takeoffStamps.setHeight`, TraceLayer pill, SheetCheck "Use"                                                    | markDropsBid, selectionDrop                                              |
| 6    | Existing-device wording and "Leave it off" (option C)                                    | `listForSheet` `ends.*OnExisting`, runEnds.tsx                                                                  | markDropsBid                                                             |
| —    | The known-answer run                                                                     | —                                                                                                               | verticalDropsKnownAnswer                                                 |

Waiting on Track A (§ 7): the per-sheet run height and the assembly's
mounting height type. Waiting on the owner: relocates (answer d).

The original order, as planned:

0. **Fix the stale records** (gap 7) — docs only, in the same commit as
   step 1, each with a line saying what replaced it and when.
1. **Gap 5 first.** A run claims a mark's drop only at an end where the run
   itself counts a vertical. Pure change in `stampsClaimedByRuns`; red test
   first (below).
2. **A linked end takes the mark's height type.** When a run end is linked
   to a mark and the end has no kind, the kind comes from the mark's
   count's `dropKind`. Not a guess (overhaul § 6): the person linked that
   mark, and the count already says what it is. A count with no `dropKind`
   leaves the end unanswered, amber, as now.
3. **Mark heights read** in `resolveMountingHeight`'s callers: one new layer
   between the run-end override and the count height, in BOTH
   `server/runVerticals.ts` and `shared/groupDrops.ts` — through one shared
   function so the two paths cannot resolve the same mark differently
   (CLAUDE.md § "Copying a layout does not copy the behaviour").
4. **`dropExcluded`** read in `groupDrops` (skipped like a claimed mark),
   with "No drop on these" on the selection pill and "N of M marks" on the
   row (quote-app-panel-plan H3 already specifies this).
5. **Set a mark's height** on its popover (typed), and **accept a read
   height** from Sheet Check (read). Flip `MARK_HEIGHT_COLUMN`.
6. **Existing-mark wording** once the owner answers § 4.

## 9. Test plan

**Known-answer run** (a new fixture, `server/verticalDropsKnownAnswer.test.ts`;
pure, no database). Priced fixture types, never shipped prices (CLAUDE.md):

- EMT run, flat **40.0 ft**, 3 conductors + 1 ground (4 wires).
- Run height **10'-0"** (job). Start: **panel**, job height **6'-0"**.
  End: **receptacle**, 1'-6" (shipped).
- Extras accepted: conduit 5 %, wire 10 %, makeup 18" at a device, 60" at
  a panel.

| Quantity                  | Working                 | Expected     |
| ------------------------- | ----------------------- | ------------ |
| Vertical, start           | (120 − 72) / 12         | **4.0 ft**   |
| Vertical, end             | (120 − 18) / 12         | **8.5 ft**   |
| Conduit installed         | 40 + 4 + 8.5            | **52.5 ft**  |
| Conduit bought            | 52.5 × 1.05 = 55.125    | **55.13 ft** |
| Wire per conductor        | 52.5 × 1.10 + 5.0 + 1.5 | **64.25 ft** |
| Wire bought, 4 conductors | 64.25 × 4               | **257.0 ft** |

**If the code prints something else, stop and find out why before going
on.** Either this table was worked from a formula the code does not use
(the 4 is 3 insulated conductors, `conductorCount: 3`, plus the run's ONE
shared ground, `groundCount: 1` — checked in `shared/takeoffQuantities.ts`
2026-10-05; a fixture that puts a ground on each circuit instead bills
three and is the first thing to look at), or the arithmetic has changed. Those want opposite responses.

Variants on the same fixture, each a separate `it`:

- **Mark height:** end linked to a receptacle mark with
  `mountHeightInches = 54` → end vertical 5.5 ft, conduit installed 49.5.
- **Read vs typed:** one mark holds ONE height, so a later typed 48 simply
  replaces an accepted read 54 (6.0 ft) and the source says `typed`. (The
  plan first said "typed wins"; with one column there is nothing for it to
  win against — whichever a person chose last is the height.)
- **Unset:** panel height cleared → start vertical not counted, reason
  `height-not-set`, conduit installed 48.5 — and NOT 40 + 4 + 8.5 with a 0.
- **Gap 5:** a leg starting on a mark with kind null → the mark's count drop
  is still counted (red with today's `stampsClaimedByRuns`).
- **Never both:** an end linked to a mark AND counting its vertical → the
  mark's count drop is left out, total vertical counted once.
- **Existing mark:** the end mark is `existing` → assert whatever the owner
  decides in § 4, and that the run row's text says it.
- **dropExcluded:** 30 receptacles, 1 excluded → 29 × 8.5 = 246.5 ft.

**On screen** (CLAUDE.md: not verified until looked at): "Sheet numbers
check" E-200 at laptop and tablet-portrait — trace the known-answer run,
read the row, set a mark's height, and watch the row, card and total move.
Delete the test counts afterwards.

## 10. Questions for the owner — ANSWERED 2026-10-05

1. **§ 4 — a run ending on an existing device:** **C** — price it,
   one-click "Leave it off". Built.
2. **Per-sheet run height:** **yes**, overriding "no per-area heights" for
   sheets. Column 1 in § 7, for Track A.
3. **Assembly height type:** **yes**. Column 2 in § 7, for Track A.
4. **Remove and relocate:** **wait** until remove/relocate labor pricing is
   decided. Until then a relocate mark gets no count drop (the existing
   `isPricedMark` rule) and nothing here changes that.
   **Decided 2026-10-06 (owner-questions § 2):** relocate is labor only, and
   new wire or boxes are counted as normal new work, so **no count drop on a
   remove or relocate mark**, which is what the code already does. Nothing
   to build here. The labor lines are `remove-relocate-labor-plan.md`
   (Track A). § 7's two columns are numbered in Track A's
   `migrations-next-batch.md`: column 1 in 0109, column 2 in 0110 (each
   shares its table's one `ALTER`).
