# Track C — handoff, 2026-10-06

Written for a restart. Worktree `C:\dev\BidPhase-C`. **Two branches now
(2026-10-07):** `track-c` (= local-dev `87affe0` when written, green) and
`c-homerun-footage` (track-c + Track A's `a-batch-c-0125` + the homerun
footage work — NOT for local-dev, see "The exact next step"). The worktree
was left on `c-homerun-footage`; `git checkout track-c` for anything else.
`main` was `24105ad`. C's databases `bidrender_local_c` and
`bidrender_test_c` both have 131 migrations (through 0130). If `git log
origin/local-dev` or `scripts/schemaDrift.mts` says
otherwise when you read this, stop and find out why before going on — either
this file is stale or the state moved.

## How C merges (owner's rule, 2026-10-06)

**CI is the full suite, not the laptop.** Before merging into local-dev:

1. `pnpm check` and the tests the change touches, locally.
2. Push `track-c`, then wait for the GitHub Actions **Gate** run's `test` job
   to go green: `gh run list --branch track-c` / `gh run watch <id>`.
3. Pull local-dev, merge, push, and confirm the local-dev run's `test` job
   is green too.

A full local suite only when CI cannot tell you something. `gh` lives at
`C:\Program Files\GitHub CLI\gh.exe`; a shell started before it was
installed does not have it on PATH, so use the full path there.

**Read the JOB, not the run.** A local-dev run also deploys staging and runs
the `smoke` job; on 2026-10-06 every local-dev run was red on `smoke`
(`touch.spec.ts`, tracked in `track-a-handoff.md`) while `test` was green. A
red run is not by itself a red suite:
`gh run view <id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'`.

## Done

- **Multiple looks** (`references/multiple-looks-plan.md` § 10), on A's
  `symbol_looks` (0102):
  - Capturing a name already in the legend asks "Add this as another look?"
    (Yes / No, a separate item / Cancel). It stays one item: one count, one
    price. A new item gets its first look with its box. An old picture
    becomes a box-less first look only when a second look is added (no
    backfill).
  - Find all matching searches the box plus up to 5 saved looks, this set's
    first, merged so one device is one find (`client/src/lib/lookMatching.ts`).
    It can also search the looks with no box. This works on vector sheets
    (another set's look is rebuilt from that set's drawing) and on scans
    (same-set looks only).
  - The legend row shows "N looks".
  - Server tests: `server/symbolLooks.test.ts`.
- **Per-set naming, the owner's rule.** A look from another plan set may
  suggest a match, never label one. A find that only another set's look made
  is flagged "Found only by a look saved on …" and is never clear, so Confirm
  all never takes it. The rule is written into:
  - `multiple-looks-plan.md`
  - `check-my-marks-plan.md`
  - `find-all-matching-plan.md` § 4a
  - `plan-viewer-overhaul.md` § 9.4
- **Blueridge answer key** (`reader-accuracy/answer-key.json`, git-ignored,
  local):
  - The `sameAs` lists are per sheet now (`sheets[...].sameAs`, read before
    the file-wide ones), and marks can be struck (`dropMarks`), both handled
    in `scripts/readerAccuracyReport.ts`.
  - On E1.01 the "point" marks are the 7 OS occupancy/daylight sensors. The
    8th mark, on the C fixture "(A-8)", is struck.
  - On E1.02 the owner's "GFCI receptacle" count is the duplex above the
    backsplash (NOTE 7). Weld 1 and UNCC still read GFCI.
- **Scans, 85 / 85** under the corrected key: 85 found, the struck mark being
  the old miss. Demolition finds: 8/8 and 37/37 labelled. Re-run with
  `pnpm tsx scripts/scanMatchingCheck.mts` (about 2 min; it reads `dropMarks`).
- **Q6 decided:** scans stay as built, with no "Confirm all — checked by eye"
  button.
- **Remove and move a look** (plan § 5, done 2026-10-05). "N looks" on the
  legend row opens the item's looks; each has "Move" (a list of the other
  items) and an × that asks once. `takeoffStamps.removeLook` / `moveLook` /
  `looksFor`. Neither writes a mark, count, bid line or snapshot — the tests
  read all of them on an open and a locked bid, before and after. The item's
  shown picture follows (`thumbnailAfterRemoval`). A move onto an item that
  already has the same look is refused. In an open Find all matching,
  unconfirmed finds the look made are dropped unless the box found them too
  (`dropLookMatches`, plan § 7).
- **Look-alike warning, all of plan § 4** (2026-10-05/06). Before ANY
  capture saves — a new item's first look or a look added to one — the
  boxed symbol is searched on its sheet together with other items' looks on
  that set (`looksOnSet`, max 12) and, when adding, the item's own looks.
  `takeoffStamps.checkLookAlikes` (read-only) names every other item whose
  marks it lands on, or whose looks find the same spots; the card also says
  when device words differ ("Your other look has 'GF' beside it; this one
  doesn't", `lookWordNotes`, from DEVICE_WORDS only, no AI). Cancel first;
  "Save anyway" / "Add anyway". On a scan it saves and says it could not
  compare. **The check moved OUT of `captureSymbol` on 2026-10-06**: the
  spots come from the client either way, so a gate there guaranteed nothing,
  and it gave the save a second result shape.
- **"From a new look"** (plan § 8 test 7, 2026-10-06). A find only an added,
  never-confirmed look made needs a look; Confirm all leaves it. Confirming
  one by hand trusts that look (`trustLooks`). The item's first look
  (`searchLooks.isFirst`) and the box are trusted. "Confirmed once" is kept
  in the browser (`@/lib/trustedLooks`) for want of a column — it fails
  toward untrusted; see the migration request below.
- **Lines crossing symbols** (2026-10-06): measured, then built.
  `find-all-matching-plan.md` § 4b has the numbers; `scripts/lineCrossingCheck.mts`
  re-runs them. On Weld 1 E-200 crossing lines cost nothing: the 2 misses are
  not crossing lines, nothing is falsely found, no template is dirty (a first
  reading said the GFCI's was; it was the GFCI's own lines). Built anyway,
  for other exports, each made to happen in a fixture: lines running through
  the box kept out of the template, a copy cut by a crossing line offered as
  "maybe — a line crosses it" (never clear), a second anchor. E-200 reads
  exactly as before. Scans: 85/85, nothing to build.

- **Scale check** (2026-10-06, `@/lib/scaleCheck`, worker `scaleEvidence`):
  a set scale is checked against the door swings on the drawing, with the
  sheet's stated scale as tie-breaker. Amber "Scale may be wrong" beside
  the scale, "Use X" / "Keep"; never applied by itself. No test sheet has a
  scale bar or a dimension line (measured), so doors are the check.
  12/12 deliberate 2x mis-settings caught on Weld 1 + UNCC; Weld E-100's
  own "1/4"" note was questioned (its doors say 1/8"). **Owner, 2026-10-06:
  Weld is our own generated set, the note was our mistake — FIXED in the
  file** (`reader-accuracy/plans/Weld 1.pdf`, git-ignored, both E-100 notes
  now 1/8"; an incremental update, every other byte original). E-100 now
  passes clean (seen on screen: 1/8" no warning; 1/4" → "title and door
  swings say 1/8""). The three `.local-storage` copies and C's local DB rows
  (`bid_pdf_sheet_text`, `detectedScaleText`, `byteSize`) were updated to
  match. **Not updated:** staging's copy and the other worktrees' copies
  (A, B, the OneDrive folder) — copy C's file over theirs if it matters.
  Scans say they cannot check. `code-first-ceiling.md` § g. SEEN ON SCREEN
  (UNCC E111 set to 1/8"): "Scale may be wrong: title says 1/4" Use it
  Keep"; "Use it" set 1/4" and the warning cleared on the re-check.
- **Panel + fixture schedules, read-only** (2026-10-06,
  `@/lib/panelSchedules`, worker `schedules`, `SchedulesView`): a
  "Schedules" button on a sheet that has one. UNCC E003: panels 2A / 2B /
  2HA, 42/42 each, name read from "PANEL 2B" UNDER the table (the study
  had said it was not in the text); E004: 6/6 fixture types. Writes
  nothing. Seen on screen; the look caught an even-side description losing
  its first word (fixed, test). weld2's PANELBOARD SCHEDULES sheets have no
  text — code cannot read them. Columns for Track A, fitted to A's ONE
  table `bid_panels` + `bid_panel_circuits`: todo.md § "Track A next
  migration batch".
- **Circuits from device tags, read-only** (2026-10-06,
  `@/lib/circuitGroups`, worker `circuits`, `CircuitsView`: a "Circuits N"
  toggle where a sheet has tags; a docked panel built for tablets). **The
  owner's model: plans tag devices ("2B-1"), they rarely draw homeruns** —
  the drawn-homerun reader below is a kept rare-case helper, not tuned
  further (its leftovers: todo.md § "Low priority — homerun reader
  leftovers"). Each tag goes to its nearest mark within 24 pt; where two
  marks share a spot (a duplex beside a data outlet) the item most often
  tagged on its own wins; an item never tagged here (data outlets, 73) is
  listed once, not flagged mark by mark. Panel spot from a "PANEL 2B" label,
  else tapped by the user (kept per browser, `bidridge:panel-spots:`, for
  want of a column); closest device at right angles. **Measured on UNCC E111
  against the owner's 243 hand marks** (`codeFirstCeiling.mts circuits`):
  duplex 108/108, USB 38/38, GFCI 4/4, J-box 11/20 grouped, 9 flagged
  untagged, 0 off schedule. **Hand check of circuits 2B-1..2B-21 (20; 2B-14
  has no marked device), by eye on tiles with every link drawn: 102 devices
  grouped, 0 on the wrong circuit, 1 missed (2B-4's J-box, tag 26 pt away —
  flagged orange, not wrong); 19 of 20 circuits exactly right.** Outside the
  sample: 2B-31's J-box lost its tag to the duplex beside it; 4 data outlets
  took a tag at floor boxes and the 6-30R spot (no 6-30R mark in the count).
  E111 has no panel label (panels are drawn on ED111, another scale), so it
  waits for a tap. SEEN ON SCREEN at tablet size (1180x820, touch): 0
  buttons under 44 px; place 2B by tap; pick 2B-2 → rings + dashed
  right-angle path to the panel. The look caught "584 pt" shown as a
  distance (now feet only, with a scale), the "place the panel first" line
  repeated on every row, and rings 2 px wide at fit zoom — all fixed.
- **Homerun footage — DESIGN ONLY** (2026-10-06,
  `references/homerun-footage-plan.md`): Measured / Average / Measured with
  a minimum, per bid with a per-area (= per-sheet) override; drops by the
  existing drop rule; routing factor ADDED to waste on material, never
  multiplied; overridable, starts unconfirmed. Overrides "no per-area /
  ceiling heights" — noted in vertical-drops-plan § 2 and overhaul § 6.
  Four owner questions in § 11 — **ANSWERED 2026-10-06**: routing + waste
  ADD (25%), waste material only; makeup at the panel end only; unconfirmed
  homeruns COUNT with "+ N unconfirmed"; per sheet for now, BUT retail
  sheets mix drop ceiling and open deck, so a one-tap homerun height
  override (§ 6, `bid_panel_circuits.homerunCeilingInches`) and height areas
  inside a sheet BEFORE BETA (todo.md, new table `bid_height_areas`). Not
  built: the footage math waits for Track A's columns. Columns: todo.md
  "Homerun footage".
- **Homerun footage CALCULATOR, standalone** (2026-10-06,
  `shared/homerunFootage.ts`, plan § 10 step 1). Pure: devices, panel
  spot, scale, ceiling, method (Measured default / Average / Measured with
  a minimum), routing, waste → wire, conduit and labor footage, every piece
  shown (run, up-drop, down at panel, 5 ft panel makeup, routing, waste).
  § 11 as answered: routing + waste ADD, waste material only, makeup at the
  panel only, unconfirmed COUNT ("+ N unconfirmed"). Also the ceiling chain
  (homerun → area → sheet → job → company), the height-area pick (smaller
  outline wins; a shared wall is not an overlap) and a traced homerun
  suppressing the computed one. **Wired to nothing** — no table, no bid, no
  screen. `server/homerunFootage.test.ts` (44); each owner rule was broken
  on purpose once and the suite went red. Known answer from UNCC E111
  circuit 2B-1 (`codeFirstCeiling.mts homerunexample`): 546.24 pt =
  30.346 ft out, + 12.5 ft drops = 42.846 ft; wire 58.558 ft per
  conductor, 175.674 ft for 3. **Assumed, not read:** the panel spot is a
  tap on E111's "existing electrical room … in this vicinity" note (E111
  draws no panel), and the 10'-0" ceiling and 6'-0" panel are the plan's
  example heights — E111 states neither. C's local DB is one migration
  behind local-dev (`takeoff_stamps.labelWords`), which is why that script
  section reads marks with plain SQL.
- **Homeruns, read-only** (2026-10-06, `@/lib/homeruns`, worker
  `homeruns`, `HomerunsView`: a "Homeruns N" toggle on a sheet that has
  any, labels beside each arrow). **UNCC draws NO homeruns** (every device
  is tagged "2B-1"; its arrows are keynote leaders) — the homeruns are on
  Weld 1 E-100/E-200 and weld2. Hand check of 23 by eye: **19 found, 0
  wrong tag, 0 false on UNCC's 273 device tags; 1 false on weld2 p8**.
  Stacked heads = circuits 7/7; wire notes 2/2 ("3 wires + ground (from
  the note)"); no sheet draws ticks and none are claimed. **Tied to a
  schedule: none possible on the test sets** — UNCC has the readable
  schedule but no homeruns, Weld's schedules have no text; every label says
  "Panel 3LP: no schedule read on this set" and the tie is fixture-tested.
  Wire counts are never inferred. Seen on screen (E-200, bid 1728356);
  labels covering their own tags and two boxes stacked were caught there
  and fixed. `code-first-ceiling.md` § d has the misses; section
  `homerunreader` of `codeFirstCeiling.mts` re-measures. Columns for A:
  todo.md § "Homeruns read from the plan".
- **Code-first ceiling study** (2026-10-06, plan only, NOT merged):
  `references/code-first-ceiling.md`, numbers from
  `scripts/codeFirstCeiling.mts`. Top 3 by payoff: tie labels to devices
  (USB 0 -> 38/38, GF 1 -> 4/4 on UNCC E111), use CAD layers when present
  (Weld 1: demolition / existing / telecom sorted free, search 14x faster),
  read panel schedules from text (UNCC 3/3 panels, 42/42 circuits). New
  this study: UNCC E111 HAS a hand count (243, sheet 234268) — 93% found.

## Not built yet

1. **Seen on screen 2026-10-06 (Weld 1 E-200):** a NEW item's capture
   warned "1 mark counted as Look test tag", and one warned "12 places a
   look of Look test third also finds and 1 mark counted as …", Cancel
   first. **Still not seen on screen (second try, 2026-10-06):**
   - the device-word note — **and it cannot show on today's sheets**: the
     matcher's word ring reads 1 of 45 labelled devices on UNCC E111 (USB
     labels sit 14.3 pt out, just past it) and Weld 1 has no GF text at the
     GFCI. A GFCI + plain-duplex look pair was added on E-200 and correctly
     said nothing. Fix the ring first (`code-first-ceiling.md` § b, rank 1);
   - "Found only by a look added recently" in the Find panel — the setup
     was in place (GFCI item with an added duplex look) when the Chrome
     window was minimized and the tab went hidden. Rests on its tests.
     **Found on screen and fixed:** a click with no drag opened the name card
     and saved an item with no picture, no look and no check
     (`isCaptureBox`, `shared/symbolCapture.ts`).
   - **Labels tied to devices: SEEN ON SCREEN 2026-10-06 (UNCC E111).** A
     plain duplex boxed: 141 found, 97 clear, 44 need a look; 36 rings say
     "USB" and 3 say "may be a GFCI", each with "Beside it: …"; the selected
     USB find reads "Needs a look — "USB" is written beside it — it may be a
     USB receptacle … Beside it: USB", and Confirm all takes only the 97.
     The ring fix also makes the device-word NOTE on the capture card able
     to show — not re-checked on screen. CAD layers (job b) were not seen on
     screen: the tab went hidden; they rest on the measurement and tests.
   - **Driving the browser:** the extension's drags often send no
     pointermove, so boxes come out empty and short pans do nothing.
     Dispatch PointerEvents in-page instead (memory: local verification
     gotchas).
2. ~~Demolition plans on VECTOR sheets by their title~~ **DONE 2026-10-06**
   (`@/lib/vectorPlans`): the scans' `planTitles` / `planRegions` on the
   vector text, with an ink map from the line work, plus one vector-only
   step — a region grows LEFT to the white gap (E-200's demolition title
   sits ~300 pt right of its drawing's edge). Known answer on Weld 1 E-200:
   demolition-plan finds clear **4 -> 0**, marked demolition **2 -> 21 of
   21**, plan A's 53 untouched; the same with no layer information. Hand
   count unchanged (44/46). The scan path is unchanged.
3. **"Find on this sheet" from one look** (plan § 5), the third action on a
   look.
4. **The per-row choice in whole-legend capture** (`LegendCapture.tsx`): a
   matching name keeps "left as it is", which is the decided default. The
   choice to make it another look is missing.
5. **Sending looks to the Reader** (plan § 3): every look under the item's
   one label, the set's own first, up to the cap. Measure first with
   `scripts/readerAccuracy.mts` methods (b)/(d), 1 look against 3.
6. **Size-aware matching across plan sets.** The line matcher compares exact
   sizes, so a look from a set drawn at another size finds nothing. Seen on
   screen: a UNCC duplex look found 0 on Weld 1 E-200. Candidate:
   `scaleTemplate` (already in `findMatching.ts`, used by the sheet check)
   at a few sizes, with every such find staying a suggestion under the
   per-set rule.

## Plans screen polish — DONE 2026-10-06

Asked by the owner as three items; none was written in this file before.

1. **Layers higher**: out of the Legend tab (4th of 5) to under "This
   sheet", pinned on every tab (`RunsPanel` `layers` slot). It filters marks
   AND runs, so it could not go in one tab. Still shut by default with
   "N hidden" in its header; the open body is capped at 40dvh because it
   sits outside the panel's one scroller.
2. **Set scale**: a yellow button on a sheet with no scale (grey where the
   sheet says NOT TO SCALE), muted once set. Narrows overhaul § 4a.2 —
   noted there and in `ScaleControl`'s header. Trade-off seen: E0.01, a
   notes sheet with nothing to measure, shows it yellow too.
3. **Dashboard**: "Recent plans" moved up under the start cards; once
   graduated, "Upload a plan" is its own yellow button and "New bid ▾" is
   outline (`NewBidMenu`). The sidebar Plans entry stays deferred (todo.md,
   owner 2026-09-27).

Seen on screen with playwright (laptop, tablet, phone; graduated header
seen by giving user 1 a labor rate for the shot, then setting it back to
0); `pnpm device:audit --check` 0 hard faults on dashboard / plans /
totals / capture. C's local DB was brought to all 125 migrations to run it.

## The exact next step

**Track B's Gap 1 is FIXED on `c-homerun-footage` (2026-10-07)** —
`references/track-b-plans-screen-gaps-plan.md` on branch `track-b`, which C
cannot edit: **Track B, mark Gap 1 done there and do not build it again.**
A run end that is dragged (or moved by removing an end point) now claims the
mark it is let go on, or nothing in open space. What "claimed" means is
unchanged: `startStampId` / `endStampId`, the run takes that box's drop and
the mark's own drop is held back (`endOfRun`, `groupDrops`).

- Client: `endClaimsAfterEdit` (`@/lib/legSnap`) in TraceLayer's one
  `commitEdit`, same `snapToMark` as a trace click (never an unconfirmed
  mark); an exact hit on a mark's connect point wins, since the drag snapped
  there. An end that did not move and a tee end are not sent. Undo and redo
  carry the claims (`undoStack` `setPoints` / `restorePoints` `ends`).
- Server: `setPoints` takes optional `startStampId` / `endStampId`, checked by
  `requireClaimableMarks` (shared with `setEnds`: own sheet, confirmed),
  refuses a mark on a tee end, and clears that end's `startConnect` /
  `endConnect` when the claim changes. The end keeps its KIND.
- Tests: `server/runSetPoints.test.ts` (7 new; 3 go red with the claim write
  off — off the mark, onto B, connect cleared) and `legSnap.test.ts` (6).
- **Seen on screen, 1180x820 touch, UNCC E111** (bid 1728359, fixture removed
  after): a 10 ft run ending on duplex A. Before: run 10 + 8.50 drop,
  107 duplexes drop on their own (909.50 ft), EMT 928.00 ft. Dragged onto B:
  claims B, run `13.28 + 8.50`, A drops again, EMT 931.28. Dragged into open
  space: claim gone, run 17 ft with no drop, 108 duplexes drop (918.00), EMT
  935.00 — before the fix this read 17 + 8.50 from A and 107. Ctrl+Z:
  "Undone: run points edited", back on A, `9.98 + 8.50`, 107.
- **Seen and left as is:** an end dragged off a mark that had no kind of its
  own (it read the mark's) is "nothing there", so the fittings say "1 run has
  a drop with no height, so its length is short". True — nobody has said what
  is at that end — but owner's call whether the end should keep the device's
  kind instead.

**`c-homerun-footage` IS READY FOR TRACK A** (since 2026-10-07, when
homerun couplings, connectors and straps landed — the owner's condition:
"this must be done before Track A merges the branch"). Everything added
since (height areas; one ceiling rule for every drop; pass-through drops;
homerun bends) is on the same branch and ready with it.

**THE MERGE RULE — for Track A:**

1. **The branch merges TOGETHER WITH A's migrations 0125–0130**
   (`a-batch-c-0125`, already merged into the branch). Never the branch
   without them: its code reads `bid_panels`, `bid_panel_circuits`,
   `bid_height_areas`, the `bids` / `bid_pdf_sheets` homerun columns and
   `takeoff_run_circuits.panelCircuitId`, and a bare `select()` on a
   database without them takes the Plans screen down. Never the migrations
   without the code either (pairing rule).
2. **If ANY other migration lands on staging or live first, A renumbers
   0125–0130 above it before merging.** The migrator skips a file numbered
   below one already applied (§ R.1 in migrations-next-batch.md), so a
   0125 behind an applied 0131 is silently never run. Checked 2026-10-07:
   local-dev still ends at 0124, so no renumbering yet.
3. **Two more columns are asked** (migrations-next-batch.md § Batch C):
   `bids.homerunExtraBends` and `takeoff_runs.runsAt`. The branch does NOT
   need them to merge — it treats them as not set (1 extra bend,
   unconfirmed; every run through the ceiling) and holds their two
   controls. When they land, C wires them (the list of what is owed is in
   that section).
4. **These change bid numbers** (owner-approved): runs and count drops now
   read the sheet's ceiling and height areas; a pass-through box counts two
   drops; homeruns count bends. Before/after for UNCC E111 are in
   homerun-footage-plan.md § 10.

**Homerun footage steps 2–4 are BUILT on branch `c-homerun-footage`
(2026-10-07), on Track A's 0125–0130 (`a-batch-c-0125`). DO NOT merge that
branch into track-c or local-dev:** staging would get code that asks for
columns it does not have. Track A merges it WITH the migrations (pairing
rule 3). What is on it, and what is not, is in
`homerun-footage-plan.md` § 10; the two notes for A are in
`migrations-next-batch.md` § Batch C. **track-c itself does not have this
work** — anything new on track-c meanwhile must not touch
`groupRunFootage`'s inputs, or the merge will conflict (the branch makes
`homeruns` a required input).

C's two local databases (`bidrender_local_c`, `bidrender_test_c`) are at
**131 migrations** (through 0130) since 2026-10-07 — ahead of track-c's
code, which is fine (additive). The server tests for the branch need
`bidrender_test_c`: `server/homerunsRouter.test.ts` (12),
`server/homerunsCore.test.ts` (22), `server/homerunFootage.test.ts` (44),
plus `client/src/lib/homerunSync.test.ts` and `homerunText.test.ts`.

Homerun fittings: DONE (plan § 10), bends included since 2026-10-07.
Height areas: DONE, reachable from "Ceilings" on every scaled sheet, read
by every drop. Reshaping an area is a before-beta todo. Next on homeruns,
when the owner says: tying a traced run
to a circuit (`panelCircuitId` is read, nothing sets it); per-sheet
average/minimum amounts on screen.

**Older next step (still open), item 1, the on-screen pass**, then item 2. For the screen: Weld 1 E-200
(vector) on "Legend capture check" (bid 1728356) and the trick from
2026-10-05 — a mark on a tag square, then box the same square as another
item — gives the card its warning in one capture.

## Migrations Track A would need

**None for anything above.** Everything listed runs on existing tables.
**New, 2026-10-06 — all three are in `todo.md` § "Track A next migration
batch" (Find all matching / looks), where A numbers them:**

- `symbol_looks.confirmedAt` (timestamp NULL, additive): when a look was
  first confirmed by hand. Today that lives in each browser
  (`@/lib/trustedLooks`), so a colleague's browser asks again — safe, but
  not shared. With the column, `searchLooks` returns it and the browser
  copy goes.
- **Words on a mark** — `takeoff_stamps.labelWords` (text NULL, additive):
  the labels Find all matching tied to a device when it was confirmed
  (`tieLabels`: "USB", `54"`, "(E)", "A2"). Today they show on the FIND
  only and are gone once the mark is placed, so a mark cannot say "54 inch
  height" or "tag A2" later, and the bid cannot price by them. NULL = never
  read (a hand mark, or before the column). A HEIGHT needs no new column:
  `takeoff_stamps.mountHeightInches` + `mountHeightSource` already exist
  (0098, on staging) — a `mountingHeightIn` asked for here on 2026-10-06 was
  a duplicate of Track C's own 2026-10-01 request, withdrawn after A caught
  it. Search todo.md for the TABLE before asking for a column. Status
  "existing" needs nothing new: mark status already holds it.

Requests that already stand, unchanged:

- `bid_pdf_legend_entries.lookId` (nullable, set null): only if A builds its
  per-set legend plan. It would also become a third way for a set to confirm
  a look (`shared/symbolLooks.ts`, `lookConfirmsSet`).
- The decision log for scan finds (`scanned-plans-plan.md` § 5), for a future
  detector. Not urgent.
- A unique key on `symbol_links (userId, lookupKey)` (A's R.6). "One item per
  name" is still enforced only in code.
