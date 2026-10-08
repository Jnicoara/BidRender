# Track C — handoff, 2026-10-06

Written for a restart. Worktree `C:\dev\BidPhase-C`. **Latest: the first
section below** (per-foot server half on `c-per-foot-logic`; C's databases
have 140 migrations, including a stand-in 0139). **Earlier, 2026-10-08:**
`c-homerun-footage` is MERGED into local-dev by Track A (`bea4d8f`, with
0125–0134); that branch is finished. Current work is on
`c-homerun-wiring` (from local-dev), merged into local-dev by C once CI is
green. `main` was `24105ad`. C's databases `bidrender_local_c` and
`bidrender_test_c` both have **135** migrations (through 0134). If `git log
origin/local-dev` or `scripts/schemaDrift.mts` says
otherwise when you read this, stop and find out why before going on — either
this file is stale or the state moved.

## WHERE THINGS STAND (2026-10-08, latest — read this first)

**Branch `c-per-foot-logic` now holds the per-foot SERVER HALF, wired**, on
top of local-dev `08205a6` (A's 0135–0138 + seed). Pushed; **NOT merged
into local-dev, on purpose: it waits for A's 0139 (`elbowFlat`) to be on
local-dev.** The branch carries a STAND-IN `drizzle/0139_elbow_flat_role.sql`
(+ journal entry) only so its CI can apply the role. **At merge: take A's
0139 file and journal entry, delete the stand-in**, re-point
`server/teeBodyRole.test.ts` (it names `0139_elbow_flat_role.sql` as the
newest list) at A's file name, and run that test. Same enum statement, so a
database that ran the stand-in accepts A's unchanged. C's databases
(`bidrender_local_c`, `bidrender_test_c`) have 140 recorded (the stand-in).

What is built (plan § 9 step 2):

- **Extras' feet.** `groupRunFootage` keeps every counted run's flat and
  vertical feet + resolved raceway waste on the type row (`extraRuns`;
  traced runs, mark drops as vertical only, homeruns), and
  `extraFeetForRuns` sums them. `feetForRole`'s `extra` tripwire is gone —
  the role is excluded from its switch and read in `withTracedFootage`
  through the line's `extraFeetPerFoot`.
- **One bid line per extra.** `runTypeRows` takes the type's extras
  (required) and emits role `extra` + `extraKey`. Bridge, send, Send again
  and `releaseArchivedPlanSlot` match lines by `runLineSlot(role,
runExtraKey)`, never the role alone. RunsPanel's send preview shows the
  extra's sentence (the one screen change — see "not looked at" below).
- **`bids.setExtraShared({ bidId, lineId, shared })`** — 0 / NULL on one
  extra line; refused on a locked bid and on any non-extra line. There is
  no "sent" marker in the schema; the lock is the only freeze.
  `bids.get` lines carry `extraNote` (how the feet were reached) and
  `extraShared`.
- **Materials list** lists each extra off the same runs, through the bid
  line's shared answer; unscaled runs go in the notes.
- **Extras CRUD**: `takeoffRunTypes.extras / addExtra / updateExtra /
removeExtra`; foot-sold materials only; a shipped type forks first (and a
  type already forked is resolved, not forked twice). No editor UI yet.
- **`takeoff_run_type_extras.materialId`** is now a resolver in
  `server/forkableReferences.test.ts` (`getRunTypeExtrasFor`).
- **700 family wired**: `fittingRowsByRunType` sends a type whose SHIPPED
  raceway is `Surface raceway, 700 series` to `countSurfaceRacewayFittings`;
  parts go out as coupling / connector (entrance end) / strap (clip, not set)
  / elbow90 (inside) / **elbowFlat** / teeBox (`SURFACE_RACEWAY_PART_ROLE`).
  `elbowFlat` is in `FITTING_KINDS`; a pipe answers 0 and the row stays
  quiet (`fittingRowSpeaks`).

**Numbers (local `bidrender_local_c`, read only).** Old code (worktree of
`08205a6`) vs new, same database, `bids.get` + `bridgeForBid` +
`materialsList.get`: **identical** on E111 bid 1728359 (pipe 3,996.04 ft)
and Bar layout check 1164558 ($378.15, 7 lines). The only diff is a new
`elbowFlat` fitting row at 0 per conduit type in the bridge, hidden by
`fittingRowSpeaks`. What the new counting gives on the same drawings
(computed, nothing written): E111 as a trench = 3,553.53 ft tape (drops not
in it), 3,731.23 ft at 5% waste, 0 ft shared; as 700 = 380 couplings, 38
entrance ends, 38 inside elbows, 76 flat elbows, clips not set — the same
figures this file predicted before the wiring. Bar layout's 2" PVC run =
80.24 ft tape (84.25 at 5%); as 700 = 1 inside elbow and the 131° corner
named for its 45°.

**Tests:** `server/runTypeExtras.test.ts` (10, DB), plus
`runTypeFootageCore.test.ts` (+2), `takeoffBridge.test.ts` (+3),
`surfaceRacewayFittings.test.ts` (+4); `perFootSeed.test.ts` now expects the
tape line (40 ft); `teeBodyRole.test.ts` pins 0139's append. **Mutation-
checked, 10 of 10 red:** no extraRuns push; shared answer ignored on read;
live line matched by role only; 700 branch removed; preview ignoring the
shared answer; elbowFlat speaking at 0; no lock check; materials list
skipping extras; flat elbow mapped to `elbow45`; drops counted as flat.

**Not built (next):** `qtySource` and the traced-parts JSON (0137/0138) are
still unread — `shared/tracedParts.ts` belongs with the bid half and the
GR2/GR5/DV34 recipe changes (plan § 9 step 3, after B's gap 11). The
"Shared trench?" button on the bid line and the run-type editor's Extras
block are screens nobody has built.

**CI (Gate 37847472206, pushed to `track-c`):** `test` GREEN — the full
suite. `drizzle-guard` RED, and that is the rule working: a track branch
may not touch `drizzle/`, and this one carries the stand-in 0139 and the
`schema.ts` enum line. It clears when A's 0139 is on local-dev and the merge
takes A's files (the branch's own `drizzle/` diff is then empty). Do not
"fix" it any other way.

**On screen (local, 2026-10-08):** a throwaway bid with a 52 ft 1"
underground run (deleted after). The Runs panel reads "Underground warning
tape 52 ft" with "52 ft of Underground warning tape: 52 ft over 1 run, the
flat length only, not the risers" under it; the Send dialog lists the tape
as its own 52 ft new line. Read from the DOM — **the driven tab was hidden,
so no screenshot: the LAYOUT is still unlooked-at**, at laptop or 1180x820.
Seen in passing, not changed: an underground type's send says "Cannot go on
the bid: Wire for 1 conduit run — conduit with nothing pulled through it",
which is true (no wire, by design § 3b) but reads as a fault on a trench.

## Earlier (2026-10-08, later)

**Branch `c-per-foot-logic`** (from local-dev `df25451`), pushed, **NOT
merged into local-dev — on purpose.** The owner's instruction: it merges
when A's M1–M4 have landed and C wires it up. It holds the per-foot plan's
counting that needs NO new column, as pure functions with tests:

- `shared/surfaceRacewayFittings.ts` — the 700 family (plan § 3c): couplings
  off 10 ft lengths; ONE entrance end per run at its start (none on a branch
  leg, none at an open quantity-trace start); corner = inside elbow, end drop
  = flat elbow (read by `legBends`, the same as a pipe's elbows); tee = a 700
  tee fitting (none on a tee standing on a counted box); clips "not set"
  while spacing is NULL; a corner that is not square buys its 90s and NAMES
  the 45° part it cannot buy. No field bend, 45, LB or pull box.
- `shared/runExtrasPerFoot.ts` — tape and any extra (§ 3a): `flat` or `all`
  feet × feet per foot, the run's raceway waste on top (bought, not
  installed), the line's shared-trench 0 vs NULL, unmeasurable runs counted
  apart and never added as 0.
- `shared/tracedParts.ts` — a part "from the traced run" (§ 3d): traced
  beats typed beats default; GR2's pipe falls back to its own 10 ft
  "default length" (read from the GR2 recipe in the test, not restated);
  tape with nothing traced is NOT PRICED; covered = priced on the run line,
  0 on the assembly line; coverage by material lineage.
- Tests: `surfaceRacewayFittings.test.ts` (18), `runExtrasPerFoot.test.ts`
  (10), `tracedParts.test.ts` (16). **Mutation-checked:** removing the
  branch-leg skip, counting drops as inside elbows, buying a tee on a mark,
  tape following risers, dropping waste and ignoring coverage each turn a
  named test red.

**Real numbers (local `bidrender_local_c`, read only, nothing written):**

- **E111 bid 1728359** — its footage is all 38 computed homeruns (no
  hand-traced runs left): pipe 3,996.04 ft (matches the earlier figure) =
  3,553.53 ft flat + 442.51 ft drops. As 700: 380 couplings, 38 entrance
  ends, 38 inside elbows (homerun corners), 76 flat elbows (2 drops each),
  clips not set. As a trench at 5% waste: 3,553.53 ft tape + 177.70 waste =
  3,731.23 ft — the drops are NOT in the tape.
- **Bar layout check 1164558** (real traced runs): the 2" PVC run's one
  corner is past 90°, so it buys 1 inside elbow and says the 45° part needs
  adding by hand. That case is why the sentence names the angle, and is now
  a test.

**FOR TRACK A, before M2 is final — a role the plan missed.** The 700 type
counts an inside elbow AND a flat elbow, two different parts on ONE run
type. `bid_line_items_bid_runtype_role_uq` allows one line per (bid, type,
role), so both cannot go out as `elbow90`. Entrance end → `connector`, clip
→ `strap`, tee → `teeBox` and inside elbow → `elbow90` can reuse existing
roles; **the flat elbow needs its own** (e.g. append `elbowFlat` to
`runMaterialRole` in M2, beside `extra`). Reusing `elbow45` would work in
the database and lie on every screen that labels the role. Not decided —
A's and the owner's call. Plan § 4 M2 says the same.

**Not done, and still waiting:** everything that reads a new column (extras
CRUD, the bridge, `setExtraShared`, freezing traced parts), and the seed
content (A's). The five owner questions below are still unanswered.

## Before that (2026-10-08, end of session)

**No job is in progress.** Working tree clean; `c-homerun-wiring` and
`local-dev` both at `11dbd02` (or later, if this commit). No WIP anywhere.
No dev server or background check left running.

**Per-foot extras plan — APPROVED by the owner** (`11dbd02`,
`references/per-foot-items-plan.md`). 700 is its own run type with 700
fittings; tape is the only shipped extra, on ten new underground PVC Sch 40
types; "shared trench" = 0 per bid line; GR2's pipe uses the traced run,
else 10 ft "default length".

**Order — do not start C's part early:**

1. **Track A first:** migrations M1–M4 (plan § 4) AND the seed content
   (eleven run types, tape extras, seven 700 fittings, 700 rename/retire,
   starter recipe changes). Not C's.
2. **Then C: the server / run-type half** (plan § 5 first list, § 9 step 2)
   — only once A's M1–M4 are on local-dev and on C's databases
   (`scripts/schemaDrift.mts`). Extras' feet, the bridge, extras CRUD and
   fork, `setExtraShared`, the 700 family's fitting rules.
3. **The bid-screen half waits for Track B's gap 11** ("fix this line"
   panel, `never-stuck-plan.md` § 3) and is built on top of it.

**Five owner questions (plan § 7) — still WAITING on the owner.** Suggested
answers, **NOT YET CONFIRMED** — do not build on them as decided:

1. 700 clip spacing: ships "not set" unless the owner gives a figure.
2. Add Sch 80 underground types (as well as Sch 40).
3. Merge the 500-series base/cover into one row, the same way as 700.
4. DV34 keeps its wire nuts.
5. GR2's elbow/connectors and GR5's connectors follow the traced pipe.

Note: Q2 and Q3 suggestions differ from the plan text, which ships Sch 40
only and leaves 500 alone. If the owner confirms them, update plan § 3b /
§ 3c and § 0 in the same edit.

## Earlier (2026-10-08) — 0131's two columns WIRED, branch `c-homerun-wiring`

- **Extra bends per homerun** (`bids.homerunExtraBends`): read by
  `loadBidHomeruns` and `forBid`, written by `setBidSettings`
  (`extraBends`, 0–4, NULL puts the question back). Stepper + "Accept 1" in
  HomerunControls; the folded card says "N extra bends per homerun · not
  confirmed" on its own line (the summary line is cut on a tablet).
- **Through ceiling / Box to box** (`takeoff_runs.runsAt`):
  `takeoffRuns.setRunsAt` writes root + every leg, NULL for ceiling; new legs
  copy it. Two gaps the old list did not name are fixed:
  `GroupableRun` lacked it (bid path) and `stampsClaimedByRuns` let a
  box-to-box run's marks drop on their own (`boxToBox` on the claim, required).
- **Run-ends list wording** (`@/lib/runEndWords`): amber only when
  something is missing; a level end says "level with the run" / "box to box
  — no drop". It used to say "no height for this type" for every uncounted
  end, which was true of one reason in four.
- **Numbers, E111 bid 1728359:** old code (worktree of local-dev) vs new,
  same database: identical — 3,996.04 ft conduit, 11,988.13 ft wire, 114
  field bends (38 "not confirmed"). Accept 1 moved nothing but the label. A
  10.09 ft run between duplexes 231916/231918: 27.09 → 10.09 ft conduit
  (−17.00), its 2B-1 wire 54.18 → 20.18 ft; field bends 116 → 114. Fixture run
  deleted after; the bid diffed back to identical.
- **Tests:** `runsAtBoxToBox.test.ts` (5), `homerunsRouter.test.ts` (+4),
  `groupDrops.test.ts` (+1), `runEndWords.test.ts` (4),
  `homerunText.test.ts` (+3). Five go red with the claim, leg copy or loader
  read taken out.
- **Sent / won bids:** there is no automatic freeze on status (by design,
  `shared/quantityLock.ts`). They are safe here because NULL was already
  counted as 1, so no stored bid changes number. A LOCKED bid refuses both
  controls and moves nothing (tested).
- **Cover plates audit:** `references/cover-plates-audit.md` (report only).

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

### MERGE NOTE FOR TRACK A (2026-10-08) — `c-homerun-footage` is ready; A merges it

> **DONE by Track A, 2026-10-08:** merged into local-dev as `bea4d8f` with
> 0131 (`bids.homerunExtraBends`, `takeoff_runs.runsAt`, both NULL = today's
> behaviour) and the example tags (0132–0134). Staging was migrated through
> 0134 first, with every bid total unchanged, and now serves `bea4d8f` (Gate
> green). Mirror branch deleted. **Nothing reads the two new columns yet**:
> C wires them and enables the two held controls (`track-a-handoff.md`
> session 17).

**local-dev (`615f122`) is merged INTO the branch** (merge `96635c1`). A
merges the branch into local-dev WITH migrations 0125–0130 (pairing rule).
**local-dev still ends at 0124 — no renumbering needed;** if anything lands
above 0124 first, renumber 0125–0130 above it before merging.

**What clashed, and how it was fixed:**

| File                                                        | Clash                                                                                                                                              | Fix                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `shared/lineNotPriced.ts`                                   | B's `hours` and C's `drops` on `NotPricedTally`; **git kept TWO `tallyLeavesOut` functions** (B's read hours, C's read drops)                      | One type with both; ONE `tallyLeavesOut` reading lines, parts, hours AND drops |
| `shared/proposal.ts`                                        | same `pricePending` line                                                                                                                           | kept B's `hoursPending`                                                        |
| `client/src/lib/notPricedTotal.ts`                          | B restructured suffix/headline (priced items, then hours)                                                                                          | B's shape, drops in the priced group                                           |
| `client/src/lib/notPricedTotal.ts` — **NO conflict marker** | B's new `materialsShare` (totals split) built the tally field by field and **silently dropped `drops`**: Materials row lost "+ N drops not priced" | carries drops (missing drop MATERIAL); `laborShare` unchanged                  |
| `notPricedTotal.test.ts`, `dashboardFollowsDrawing.test.ts` | C's one-token `, 0` edits vs B's edits                                                                                                             | took B's files whole, re-added the required `dropsNotPriced` argument          |
| `server/routers/assembliesRouter.ts`                        | imports                                                                                                                                            | both kept                                                                      |
| `CHANGELOG.md`                                              | both sides' 2026-10-07 entries                                                                                                                     | both kept                                                                      |

**Kept from local-dev, checked present:** Most used row (`MostUsedRow`,
both pickers), totals split (`materialsShare`/`laborShare`), upload stream
fix (`disableStream` in `shared/pdfRangeLoading.ts`), Labor-only tick box
(beside C's "Mounts at" in the assembly editor).

**Checked:** `pnpm check` clean; touched tests 152/152 locally
(dropsNotPriced, notPricedTotal, dashboardFollowsDrawing, proposal,
deviceMountKind, groupDrops, assemblies). Full suite: GitHub Actions run
37709024423 on the mirror branch `a-ci-c-homerun-footage` (the Gate does
not run on `c-*`; a `track-*` name would trip drizzle-guard on A's 0125–0130
commits). **Delete `a-ci-c-homerun-footage` after merging.** On screen at
1180x820 touch: E111 38 homeruns / 11,988.1 ft wire / 2B-1 42.8 ft
(unchanged by the merge); Ceilings panel opens; Most used row shows (3
throwaway bids made for it, deleted); bid totals "Materials $0.00 + 205
drops not priced", Labor without it; no page errors.

**A must check after merging:** (1) CI green on local-dev; (2) apply
0125–0130 to staging BEFORE the code reaches it (step 1, additive — the
Gate's deploy refuses a drizzle/ change anyway). The catalog rename was
checked: no test this branch adds or changes looks a material up by a
renamed name (`'1/2" EMT'` is not renamed; `"#12 THHN"` is used only in
local-dev's own tests).

**Patent Option A — DONE on `c-homerun-footage` (2026-10-07).** The dashed
one-corner device-to-panel line is removed from `CircuitLayer`; a picked
circuit's devices are ringed (leaving device larger) and the panel stays
marked, with NO path between them. Length math untouched (homerun suites
pass unchanged). Guard: `server/noHomerunPath.test.ts` (reads the layer's
source, comments stripped; red on the old file). Seen at 1180x820 touch on
E111, circuit 2B-1: 7 rings, 1 panel mark, 0 line elements, 42.8 ft.
`references/homerun-patent-notes.md` § 4 now quotes claims 1, 13 and 4–9
(fetched from Google Patents; attorney to verify the wording) and says per
element what the app does. Honest flag in it: |Δx| + |Δy| equals the length
of the one-corner orthogonal path even with nothing drawn. Do NOT add a
straight-line / "direct" option (claim 1).

**Drops not priced are in the bid's not-priced check — DONE on
`c-homerun-footage` (2026-10-07, owner YES).** `NotPricedTally.drops`
(optional, so B's lines-only tallies need no edit), `withDropsNotPriced`
(adds nothing when 0), `tallyLeavesOut` (the print's gate),
`db.bidDropsNotPriced` → `bids.get.dropsNotPriced` and the proposal's tally.
`bidNotPricedCount(lines, dropsNotPriced)` takes it as a REQUIRED argument.
Seen at 1180x820 touch on E111 (a $100 line added for the check, removed
after): totals "$100.00 + 205 drops not priced", strip "205 drops not priced
— drop material not set …", proposal "Price pending", Print blocked:
"205 drops are not priced … until they are priced on the Plans screen".
**Merge hazard for A/B:** local-dev's own `tallyLeavesOut` (with `hours`)
must keep drops — `server/dropsNotPriced.test.ts` guards it (todo.md).
Not in analytics or dashboard cards (todo, owner's call).

**Patent notes — PLAN ONLY:** `references/homerun-patent-notes.md` for the
attorney (US 11,120,171): how each method gets its length (right-angle
distance, no route stored, one dashed display line when a circuit is
picked), nothing like avoid-areas or tray-following, and options A (drop the
display line), B (user traces every homerun), C (typed lengths only).

**Viewing never changes a saved number; drop material not set is said; run
names say "No drop here" — DONE on `c-homerun-footage` (2026-10-07).**

- **Homeruns:** `syncHomerunCircuit` takes `repoint` (required). A visit's
  `homeruns.syncSheet` only creates circuits it has not seen (leaving device
  written once); `rematch: true` re-points UNCONFIRMED ones (confirmed never)
  and returns `{ created, repointed }`. Sent by "Re-match homeruns on this
  sheet" (Circuits panel, beside Confirm) and by the first sync after a
  panel is placed or removed BY HAND (`rematchOnNextSync`). A "PANEL 2B"
  label only fills a panel with no saved spot — it used to move a
  hand-placed one back on every visit.
- **Seen at 1180x820 touch, UNCC E111:** three open/close visits — totals
  identical (38 homeruns, 3,996.04 ft pipe, 11,988.13 ft wire, same leaving
  devices). Then 3 unconfirmed homerun devices pointed elsewhere by SQL (as an
  old sync left them): 3 visits identical at 4,271.28 / 12,813.84 ft (the old
  code moved them on the first); "Re-match" → toast "3 homeruns re-matched
  to the device now closest", 3,996.04 / 11,988.13 ft; 3 more visits
  identical.
- **No drop material:** `groupDrops` reason is `DROP_MATERIAL_NOT_SET`
  ("drop material not set") with `notPricedDrops` (wanted, with a height,
  not claimed); row "Drop material not set — 86 drops not priced";
  Totals "205 drops not priced — drop material not set on 5 counted items.
  Not in these totals."; materials list "NOT on this list: …". Never 0 ft.
  The BID page does not say it yet (todo, owner's call).
- **Run name:** `runNameParts` names an end at run height
  `END_NO_DROP_LABEL` — "Panel → No drop here" (owner wrote "No drop";
  kept the full phrase so name, row, chip and picker are one string).
- Tests: `homerunsRouter.test.ts` (three visits identical — red with the old
  re-pointing; Re-match re-points unconfirmed only), `groupDrops.test.ts`
  +3 (+1 reworded), `deviceMountKind.test.ts` +1 (Totals + materials list),
  `takeoffVerticals.test.ts` run name.

**Count drops from the item, Data/TV type, "No drop here" picker — DONE on
`c-homerun-footage` (2026-10-07, owner's three YESes), no new column.**

- **Count drops:** `loadGroupDrops` resolves each count's kind with
  `deviceKind` (count's "Each drops to", else its item's "Mounts at"; the
  row says "— from the item" and "(default height)"). The run type a drop is
  made of is still asked per count. **No box twice:** a box a computed
  homerun rises from (up-drop counted) is claimed like a run end's
  (`groupDrops` `homerunClaims`, REQUIRED); the row says "N marks are where
  a homerun rises". `takeoffRuns.drops` labels by the resolved kind.
- **Data / TV / Low voltage:** shipped type `low-voltage`, 18", common.
  Starters MS6/MS7/MS8 ship `mountsAt: "low-voltage"` (insert, plus a
  fill-only pass in `seedBaselineAssemblies` — never over an answer).
- **Wording:** `endKindLabel(distribution)` = `END_NO_DROP_LABEL` ("No drop
  here"), so the picker beside the chip and the trace toolbar match it; the
  picker now sizes to its text (it cut "No drop he" at tablet size — seen).
  The "Mounts at" picker was widened too (cut "Data / TV / Low voltage –").
- **Measured, old rule vs new on the SAME data** (code switched, all
  counts given 1/2" EMT as their drop type, items: duplex, double duplex,
  USB, GFCI → Receptacle; switch → Switch; J-box → wall J-box; data/TV →
  Data/TV):
  - UNCC E111: count drops 108 → 205, pipe 918.00 → 1,645.00 ft, wire
    3,672.00 → 6,580.00 ft; **boxes counted twice 22 → 0**; homeruns
    76/76 either way (3,996.04 ft).
  - Weld 1 E-200 (answer-key bid 1728355): count drops 0 → 30, pipe 0 →
    173.50 ft, wire 0 → 694.00 ft (no homeruns on that bid).
  - Data/TV on E111: homerun drops 75 → 76 of 76, installed 3,987.54 →
    3,996.04 ft, wire 11,962.63 → 11,988.13 ft.
  - Hand checks: E111 190 × 8.5 + 15 × 2 = 1,645; Weld 11 × 2 + 15 × 8.5 +
    4 × 6 = 173.5.
- **Seen at 1180x820 touch:** "Mounts at" lists "Data / TV / Low voltage —
  1'-6"" and saved it on the data item; the five E111 counts read "… — from
  the item", "(default height)", "22 / 5 / 7 / 1 marks are where a homerun
  rises"; a run end at "No drop here" shows it on chip and picker.
- **Left in C's local DB:** the "Mounts at" answers on user 22173517's
  items (that is the shop library). Every count's drop type and the test
  runs were put back.
- **Measuring note:** opening the Circuits panel re-points unconfirmed
  homeruns, so homerun numbers move between visits (todo.md).
- Tests: `deviceMountKind.test.ts` +5 (2 red with the change switched off),
  `groupDrops.test.ts` +3 (homerun claims), `takeoffVerticals.test.ts`
  (new type; end label — red before).

**Shop default heights + "No drop here" — DONE on `c-homerun-footage`
(2026-10-07), no new column** (the owner asked for columns; every answer
already had one — table in `migrations-next-batch.md` § Batch C, todo.md
beside it).

- **Device type from the item:** `deviceKind(dropKind, assemblies.mountHeightTypeKey)`
  (0110, unread until now) for homeruns (`loadBidHomeruns`) and linked run
  ends (`getMarksLinkedByRuns`), resolved through forks
  (`getAssemblyMountKinds`). Set as "Mounts at" in the assembly editor
  (`assemblies.mountTypes`, library permission); refused if not a height
  type (`server/knownHeightKind.ts`, shared with run ends). Count drops
  unchanged (todo, owner's call).
- **"default height"** where the type's height is in use: homerun rows
  ("8.5 ft up (default height)", `homerunBreakdown` takes the source,
  required) and run ends (`@/lib/heightSourceWords`). A device with no type:
  "up not counted — device type not said".
- **Open space:** the chip "Nothing" is now **"No drop here"** (same saved
  answer: end kind `distribution`); an unanswered end reads "nothing there —
  no drop counted" with "Pick what is here … or No drop here"; a drag that
  leaves an end bare lights it in Run ends and says so in a toast.
- **UNCC E111 (bid 1728359), duplex count answered as Receptacle, panel
  6'-0" on the bid:** before 62 of 76 homerun drops (14 up missing: 7 USB,
  3 GFCI, 3 J-box, 1 TV data), 4,028.31 ft pipe, 12,084.94 ft wire. After
  "Mounts at" (USB by tablet screen; GFCI — a shipped item, forked — and
  J-box by API): 75 of 76, 4,119.31 ft (+91.00 = 10 × 8.5 + 3 × 2), wire
  12,357.94. The 16 in the earlier note could not be reproduced: the
  leaving devices have been re-synced since. Circuits panel on screen: 37
  rows "(default height)", 1 "device type not said".
- **Open-space end, on screen at 1180x820 touch:** a run onto duplex A,
  8.5 ft drop, 3 straps. Dragged into open space: end lit, "nothing there —
  no drop counted", 17 ft, "At least 3 straps … (1 run has a drop with no
  height …)". "No drop here": "no drop here", warning gone, 3 straps, kind
  `distribution` saved. Fixture run removed; the homerun setup on the bid
  (scale, panel spot, homerun type, duplex Receptacle, panel 6'-0", the
  three "Mounts at") is LEFT for the next check.
- Tests: `server/deviceMountKind.test.ts` (8; 5 red with `deviceKind`
  ignoring the item), runSetPoints +1, `heightSourceWords.test.ts`,
  homerunText +2, runEndPicks label.

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
