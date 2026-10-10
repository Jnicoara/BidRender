# Track C — handoff, 2026-10-06

Written for a restart. Worktree `C:\dev\BidPhase-C`. **Latest: the first
section below** (`c-sch80-500` merged to local-dev 2026-10-09 and looked
at on screen; C's databases have 142 migrations, through A's 0141).
**Earlier, 2026-10-08:**
`c-homerun-footage` is MERGED into local-dev by Track A (`bea4d8f`, with
0125–0134); that branch is finished. Current work is on
`c-homerun-wiring` (from local-dev), merged into local-dev by C once CI is
green. `main` was `24105ad`. C's databases `bidrender_local_c` and
`bidrender_test_c` both have **135** migrations (through 0134). If `git log
origin/local-dev` or `scripts/schemaDrift.mts` says
otherwise when you read this, stop and find out why before going on — either
this file is stale or the state moved.

## START HERE (2026-10-10, evening) — remove/relocate MERGED to local-dev (`d832e34`); FOR TRACK A: recount bids with remove/relocate marks before it goes live

**Both known gaps below are FIXED on `c-remove-relocate` `d832e34`**, and
that commit is now local-dev (fast-forward push `07c7407..d832e34`;
local-dev is checked out in A's folder, so C pushed the commit, it did not
check the branch out). `track-c` has merged it (`d024c09`).

- **Warning strip:** a remove / relocate line with no hours now has its own
  entry per kind — "1 remove line has no hours — its labor is not in the
  total above." — with a **Set remove hours** / **Set relocate hours**
  button that scrolls to the first such line and focuses its hours box. It
  is no longer counted in "N lines are not priced … type a price" or in
  the hand-priced "no labor hours" entry (`missingEntryCounts` skips role
  lines; `roleLinesWithoutHours`, `roleHoursStripText` in
  `shared/roleLines.ts`). The "no labor hours" entry gained a **Set hours**
  button (every warning gets a fix-it).
- **"0 h" on a free count with no hours** now reads **"Hours not set"**,
  tappable to focus the box. The hours-cell decision moved to
  `client/src/lib/bidHoursCell.ts` so the suite reaches it.
- **Tests:** red without the fixes (3 failed: noHours 4 vs 1; "hours" vs
  "handHoursNotSet" twice), green with them — removeRelocateLabor 11,
  bidHoursCell 4, freeCount, fixWalk: 45 passed. `pnpm check` clean.
- **Looked at on screen**, tablet portrait 820×1180 (playwright, bid
  **1728376 "Remove relocate check"** on `bidrender_local_c`, user 1 — a
  fixture with an install, a remove, a relocate and a free-count line, all
  without hours; leave it or delete it): no "0 h" cells, three "Hours not
  set", all three buttons focus the right box, nothing sideways or below the
  edge.
- **Gates:** branch Gate 38069818821 on `d832e34` GREEN; local-dev Gate
  38070648397 on `d832e34` GREEN.
- **No numbers moved by this fix** — wording and buttons only.

### FOR TRACK A — before remove/relocate goes LIVE

**This code raises totals ONLY on bids that have remove or relocate marks**
(a sent count gains a labor line per kind; with hours set, that labor is
added to the total; with hours not set, the line is "Not priced" and the
bid says "+ N not priced"). Bids with no such marks are unchanged
(measured: all 4,235 on `bidrender_local_c` unchanged, 0 had such marks).
**In the release plan, A must count the LIVE bids with remove/relocate
marks** (`takeoff_stamps.status IN ('remove','relocate')`, grouped by bid)
and recount those bids' totals before and after, so the owner knows which
live bids move and by how much before it ships. No migration (0110 / 0111
/ 0115 already exist).

### Owner questions — explained in plain words (2026-10-10)

Given to the owner in chat: quick-bid Q1, Q2, Q3, Q6, Q8 and
status-and-scope Q10, each with what it means on a job, the suggested
answer and what it does to the numbers. **ANSWERED the same evening — all
six took the suggested answer.** Recorded in `quick-bid-plan.md` § 12 and
`status-and-scope-plan.md` § 8 Q10.

## EARLIER (2026-10-10, later) — remove/relocate labor on `c-remove-relocate`; quick-bid plan written

**JOB 1 — remove / relocate labor, built on `c-remove-relocate` (`a7fe812`,
branched from `track-c`, pushed).** Owner answers are in
`status-and-scope-plan.md` § 8. What it does: a count with remove or relocate
marks puts ONE labor line per kind beside its install line ("Remove duplex
receptacle × 2"). The hours freeze at send: the count's per-bid override,
else the assembly's, else NOT SET, which shows "Not priced" (never $0) with
a "Set remove hours" / "Set relocate hours" fix-it on the line. Only NEW
marks price material. A role line has no `assemblyId`, no material and is
ticked labor-only. Rules: `shared/roleLines.ts`. Status in
`remove-relocate-labor-plan.md`.

- **No migration.** 0110 / 0111 / 0115 already exist. So the merge gate is
  the CI Gate alone.
- **Gate:** run 38024821205 on `a7fe812` was IN PROGRESS when this was
  written (one-off check, no watcher). **Check it once. If it is green, pull
  local-dev, merge `c-remove-relocate` into it, and push. If it is red, read
  the failure first.**
- **Measured:** `bidTotals.mts`, track-c vs c-remove-relocate on
  `bidrender_local_c`: "ok all 4235 bid(s): totalDue unchanged; not-priced
  and incomplete unchanged". 0 of 4,235 bids have remove/relocate marks,
  and 0 role lines exist. The new test `server/removeRelocateLabor.test.ts`
  is 9/9 green and red without the change (6 failed). The 8 touched test
  files give 163 passed, 1 skipped. `pnpm check` is clean.
- **Looked at on screen** (820×1180): the bid line shows "Hours not set",
  "Not priced", and a "Set relocate hours" button that focuses the box. The
  count card shows the split, "1 relocate — labor not on the bid", "Add
  relocate labor to bid" and the "Hours…" fold. Nothing is below the edge.
- **Known gaps, not fixed:** (1) the bid's warning strip text ("Type a
  price on a line priced by hand") also counts role lines, whose fix is
  hours, not a price. The wording wants a role-aware branch. (2) This one
  is older: a free count with no hours shows "0 h" in the bid hours cell
  (the role line was fixed to "Hours not set").

**JOB 2 — `references/quick-bid-plan.md` (plan only).** It covers typed
footage with no plans, homeruns by average, rooms with an ADDED difficulty
factor, a status chip per line, job-type checklists, job costs in one spot,
and phone walking. It lists four additive migration drafts for A (Q-M1 to
Q-M4, unnumbered: A assigns the numbers) and nine owner questions. Q1, Q2,
Q3, Q6 and Q8 change bid numbers. The suggested first build is job costs
on Quick bid, which needs no migration.

**Was still with the owner (answered 2026-10-10 evening — yes to both):** `status-and-scope-plan.md` § 8 **Q10** (does a
"By others" / "Excluded" line leave the materials list and the drops?). It
changes numbers on two screens, so it was sent back.

## EARLIER (2026-10-10) — step-based labor, code half on `c-step-labor`: MERGED (see below); FOR TRACK A: migration 0143

**Branch `c-step-labor`, from `origin/a-catalog-reality` `8f28a85`** — A's
catalog merge was NOT on local-dev when this started (local-dev was
`aaed2a8`), and a-catalog-reality already contains local-dev, so it is the
"local-dev after A's merge" the owner asked for. **When A pushes it to
local-dev, merge local-dev into `c-step-labor` first.** Do NOT merge
`c-step-labor` into local-dev until the owner says so. `c-pvc-4080` left
alone (A merged it into the catalog job).

**MERGED to local-dev 2026-10-10** (fast-forward from `c-step-labor`)
after: Gate 38019884197 on `21468a9` green (full suite); Track A applied
0143 to staging 03:34 UTC (backup
`staging-2026-10-10T03-30-47Z-before-0143.sql`; rehearsed on its restore:
1 applied, 144, 180/180 FKs, 1,062/1,062 bids unchanged with the old code,
this code and after its first boot; on staging 1,066/1,066 existing bids
unchanged). The local-dev push is what deploys this code to staging; A
checks that Gate.

**Merge order (owner, 2026-10-10):** wait until A has (a) pushed the catalog
job to local-dev — DONE, `334104a` / `8f28a85` / `aec561b` on local-dev as
of 2026-10-10 02:20 UTC — AND (b) applied migration 0143 — NOT YET (0143 is
on `c-step-labor` only). Then: pull local-dev, merge it into
`c-step-labor`, push, check the Gate ONCE (no background watcher), and
merge to local-dev only after it is green (pull first). Every bid total
must stay unchanged (measure with `scripts/bidTotals.mts` before and after).
**Laptop rule (owner):** never run the full suite here — low memory; GitHub
Actions runs it. Run only the test files touched.

**THE OWNER PRICES CABLE PER-FOOT HOURS FIRST (owner, 2026-10-10).** Step
totals stay "not set" on every starter that carries cable (28 of the 30)
until the cable rows have hours per foot, because the cable step reads each
cable's own per-foot hours (Q1). So the order is: the owner fills the cable
rows on `pricing/labor-units-starter.xlsx` (hours per 100 ft) → A loads
them → THEN the step minutes and overheads on the Steps / Step totals tabs
can unlock step totals, and only then can `starterHoursClearable` let any
typed starter hours clear (Q2/Q7). Typing step minutes before the cable
hours is harmless, but nothing will price from steps until both exist.

Plan and owner answers: `references/step-based-labor-plan.md` (§ 13
answers and the bid-number check; § 14 the Steps / Step totals tabs for A's
one sheet rebuild). Same file on `track-c` (`519e099`).

### FOR TRACK A — migration 0143 (only A runs it on shared databases)

File on the branch: **`drizzle/0143_labor_steps.sql`** + journal entry
(`when` 1789963300000), **renumbered from 0142 on 2026-10-10** because A's
`0142_search_misses` took that number (same `when` as the old 0142 entry —
so a database that had C's old 0142 recorded must drop that record and the
two tables before migrating, or the migrator counts A's 0142 as applied;
C's two databases were reset that way). Renumber again freely if 0143 is
taken first. Hand-written,
ADDITIVE, step 1 of the three steps — **safe before OR after the code**:

```sql
CREATE TABLE `labor_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`baselineId` int,
	`stepKey` varchar(32),
	`name` varchar(255) NOT NULL,
	`unit` varchar(64) NOT NULL DEFAULT 'each',
	`minutes` decimal(8,2),
	`reasoning` text,
	`isExampleMinutes` boolean,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `labor_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `labor_steps_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE INDEX `labor_steps_userId_idx` ON `labor_steps` (`userId`);
CREATE INDEX `labor_steps_baselineId_idx` ON `labor_steps` (`baselineId`);
CREATE TABLE `assembly_labor_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assemblyId` int NOT NULL,
	`kind` enum('step','cable') NOT NULL DEFAULT 'step',
	`laborStepId` int,
	`count` decimal(10,2) NOT NULL DEFAULT '1',
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `assembly_labor_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `assembly_labor_steps_assemblyId_assemblies_id_fk` FOREIGN KEY (`assemblyId`) REFERENCES `assemblies`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `assembly_labor_steps_laborStepId_labor_steps_id_fk` FOREIGN KEY (`laborStepId`) REFERENCES `labor_steps`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE INDEX `assembly_labor_steps_assemblyId_idx` ON `assembly_labor_steps` (`assemblyId`);
```

- **Before 0143** the code runs: every step read treats ER_NO_SUCH_TABLE as
  "no steps" (`stepsTablesMissing`, server/db.ts — only that error; anything
  else throws), the seed pass does nothing, and pricing is exactly today's.
  `schemaCheck` / `schemaDrift` still REPORT the two tables missing, loudly,
  until it runs. Measured: the assembly, kit, example-tag and bid-line
  suites, 166 green on `bidrender_test_c` WITHOUT the tables (the one red,
  DV33 in `starterAssembliesSeed`, is the same red from a clean
  `a-catalog-reality` checkout on that database — not this change).
- **After 0143**, first boot seeds 47 shipped steps (all minutes NOT SET) and
  the step lists of the 30 starters (194 lines). **No number moves**:
  measured on `bidrender_local_c`, old code before vs new code + 0143 +
  seed after — `bidTotals` "all 4235 bid(s): totalDue unchanged; not-priced
  and incomplete unchanged"; `routerSnapshot` 0 of 4,235 bids differ.
  **Re-measured after the renumber (2026-10-10):** both C databases reset to
  local-dev's state (old 0142 record and the two tables dropped, A's
  `0142_search_misses` applied from local-dev's own `drizzle/`), `bidTotals`
  taken with local-dev's code (`f03e8ef`), then 0143 applied, the step seed
  run (47 steps, all not set; 30 lists, 194 lines), `bidTotals` with
  `c-step-labor`: **"ok all 4235 bid(s): totalDue unchanged; not-priced and
  incomplete unchanged"**.
- `schemaDrift` on `bidrender_test_c` after 0143: "Database matches the
  schema", foreign keys 180/180.
- C applied 0143 to C's OWN `bidrender_local_c` and `bidrender_test_c` (both
  now **144** migrations, through 0143). Nothing shared was touched.

### What the code does

- `shared/assemblyHoursSource.ts` — THE decision: typed > steps (all timed)
  > not set; one untimed step = not set; the cable step reads each cable's
  > own per-foot hours (Q1); `starterHoursClearable` (Q2/Q7 rule); no "0 min".
- Bid snapshot, assembly preview, kit preview all price through it
  (`assemblyHoursSourceFor`). Bid lines freeze it, as before.
- `laborSteps` router (list / setMinutes forks a shipped step / create /
  acceptAll = "Use these times"); `assemblies.update` takes `steps`;
  `assemblies.get` returns `hoursSource`. Forks copy the step list.
- Seed: `server/seed/starterLaborSteps.ts` (library + 30 lists, NO minutes);
  generated-by-A's-loader `starterStepMinutes.ts` and
  `starterAssemblyOverhead.ts` ship EMPTY — the loader spec is plan § 14.
- Screen: assembly editor → **"More options"** (closed by default) →
  "Build hours from steps"; the quiet grey line under the hours ("Steps: 0
  of 8 timed" / "Steps add to 0.51 h" / "Priced from its steps: …").
  **Looked at on screen, tablet portrait 820×1180** (playwright,
  `scripts/deviceAudit.mts` helpers, user 1, Duplex receptacle standard):
  closed and open; unset minutes show "not set", never "0 min"; the cable
  row says its hours per foot are not set; no sideways scroll, nothing cut
  off. Nothing saved.

### Tests

`server/stepLabor.test.ts` (21) and `client/src/lib/assemblyStepsDraft.test.ts`
(5). **Red without the change:** the bid snapshot put back to typed-only
hours → 2 failed ("expected null to be '0.5000'", "… '0.2000'"); restored
→ green. `pnpm check` clean. **Full suite on `bidrender_test_c`: 375 of
379 files green.** Of the 4 red, three were this change and are fixed
(American spelling "colours"/"armour" in two step reasonings; `stepKey` added
to backup.test's identifier list; `assembly_labor_steps` given its two
decisions in forkableReferences.test) — those four files 65/65 green after.
The fourth, `starterAssembliesSeed` DV33, is the pre-existing red described
above. The Gate on the push is the full proof on a fresh database.

## Earlier (2026-10-09, later) — Gate green; looked at on screen; one false sentence fixed

- **Gate 37977597726 on `47e4bd8` (the merge): ALL GREEN** — test,
  deploy-staging, smoke; drizzle-guard skipped (no `drizzle/` change).
- **On screen, laptop 1536×864 and tablet 820×1180** (playwright via
  `scripts/deviceAudit.mts` helpers, Bar layout check 1164558, user 1).
  Two runs added by API (a 500 run, a 2" Sch 80 trench) and one 500 run
  traced through the UI, all three removed afterwards; nothing sent, the
  bid's lines untouched. Seen right: the conduit picker's
  **"Underground (18)"** fold, closed by default, below the six saved
  types; opened, **Sch 40 ½"…4" then Sch 80 ½"…4"**; the 500 type beside
  700 and armable (the UI trace armed it). The 500 Traced-footage block
  names only 500 parts (coupling, entrance end, support clip "not set",
  inside elbow), "Send 4 lines"; the Sch 80 block's tape says "the flat
  length only, not the risers". No horizontal overflow at either size.
- **Found and fixed: "Nothing traced under this type yet." beside 80 ft of
  traced raceway.** Wire comes from a run's circuits, and a run traced
  through the UI has none until somebody adds wires — so the wire rows were
  0 ft, and `runRowSendability` said every 0 ft row was "nothing traced"
  (panel AND the post-Send toast; every conduit type, 700 and EMT too).
  It now takes a REQUIRED `typeTraced` (`runTypeTraced(rows)`, shared) and
  says "No wire on these runs yet — open a run to add its wires." when the
  pipe has feet. Test in `server/takeoffBridge.test.ts`, **red without the
  fix** ("expected 'No wire…', received 'Nothing traced…'"), green with it;
  five related files 96 green; `pnpm check` clean. Looked at again on
  screen at both sizes after the fix.
- Stale comment in `RunTypePicker.tsx` ("ten shipped underground types")
  now says 18.
- Dev server stopped, whole tree; port 3004 free. Temp scripts deleted.

## Earlier (2026-10-09) — `c-sch80-500` MERGED into local-dev; Q11 answered

**Merged.** A's seed (`8f3045c`) and A's 0141 were on local-dev, so
`origin/local-dev` (`679cce8`) was merged into `c-sch80-500` and the result
pushed to local-dev as a fast-forward. Conflicts: `baselineRunTypes.ts`
and `perFootSeed.test.ts` took A's (a superset, as A's note below said);
CHANGELOG and this file kept both. **C's databases `bidrender_local_c` and
`bidrender_test_c` now have 142 migrations** (0141 applied this session).

- **`sch80And500Runs.test.ts` now runs on the SHIPPED rows**: the shipped
  `2" PVC Sch 80, underground` type (waste set → it forks; the fork keeps
  the shipped tape, which the tape line proves) and the shipped 500 type,
  raceway and parts. The stand-in company type and the shared fixture rows
  are gone; the file seeds the catalog it reads in `beforeAll`.
- **Tests:** the nine Sch 80/500 files (`sch80And500Runs`,
  `sch80And500Seed`, `surfaceRacewayFittings`, `runTypeFold`,
  `perFootSeed`, `catalogReview20261008`, `catalogReviewSeed`,
  `runNoWire`, `runTypeExtras`) — **118 green** on `bidrender_test_c`;
  `pnpm check` clean. Full suite: the Gate on the local-dev push.
- **E111 1728359 and Bar layout check 1164558 unchanged:** `bids.get`,
  `bridgeForBid`, `materialsList.get`, `takeoffSummary.forBid`, local-dev
  tip vs the merge, same `bidrender_local_c` — identical apart from the
  `preparedOn` clock.
- ~~Not done: looking at the fold and the 500 Send block on screen~~ —
  done the same day, see above.
- **Q11 (auto branch runs) answered by the owner: YES.** A detour over 3×
  the straight right-angle distance is a WARNING with the fix-it buttons,
  priced, never a block. Written into `auto-branch-runs-plan.md` § 3c,
  § 3d, § 11, § 13 on **`track-c`** (`77479ce`) — that plan lives on
  `track-c` only, not on local-dev yet.

## Earlier (2026-10-08, proof session) — tape test proven; runNoWire reds explained and fixed; still NOT MERGED

Still on `c-sch80-500`; no merge until A's seed landed (it has — above).

- **Sch 80 tape test proven.** `extraFeetForRun` temporarily made to follow
  every foot (risers included) → `sch80And500Runs.test.ts` red "expected
  116.6 to be 110"; restored → green; tree clean before commit.
- **The 9 runNoWire reds: test setup, not a bug.** The file read shipped
  rows by name and never seeded; `#12 THHN green Copper` is new with A's
  catalog review, so right after 0140 it was absent until some other file
  seeded. Reproduced on a scratch DB (seeded at `ca8030c`, migrated to 0140):
  11 red, "reading 'id'". Now it seeds in `beforeAll` → same DB 18/18 green.
- **Shuffling found two more, in `runTypeExtras.test.ts`**: user created only
  in the first describe; the $0.25 tape fork leaked into the "not priced"
  test. File-level user + per-test reset of the company's own rows: 8/12
  shuffle seeds red before, 12/12 green after.
- Eight touched test files (108 tests) green on shuffle seeds 1–8 on
  `bidrender_test_c`; `pnpm check` clean. Full suite not run on the laptop.
  Details: `sch80-and-500-plan.md` § 7b. Scratch DB and worktree removed.
- **Gate 37882413912 on `f4604c0`: test GREEN (full suite)**; drizzle-guard,
  deploy-staging and smoke skipped, as expected on a `c-*` branch.

## Earlier (2026-10-08, build session) — Sch 80/500: C's half BUILT on `c-sch80-500`, NOT MERGED

**DO NOT MERGE `c-sch80-500` INTO local-dev UNTIL TRACK A'S SEED LANDS**
(owner, 2026-10-08). The exact list A must add is
`sch80-and-500-plan.md` § 7c — nine Sch 80 underground types, the 500
rename/retire/nine adds, the 500 run type, and A's seed tests. When it is on
local-dev: merge local-dev into `c-sch80-500`, switch the Sch 80 case in
`server/sch80And500Runs.test.ts` to the shipped type (§ 7b), run the touched
files, Gate, then merge — and look at the fold and the 500 Send dialog on
screen (plan § 6).

Branch from `origin/local-dev` `d36bfc9` (A's 0140 included). Built:
`undergroundRunTypeLabel(size, schedule)` (schedule required), the fold
sorting Sch 40 then Sch 80 by size, and the 500/700 fitting family as a
closed list (`surfaceRacewaySeries`; 1500 off; `isSurfaceRaceway700`
deleted) with `fittingRowsByRunType` branching on it. The seed file was
touched only to pass `"PVC Sch 40"` to the two existing label calls. Tests
and their red-without-it checks: plan § 7b. Full suite NOT run on the
laptop. `bidrender_local_c` and `bidrender_test_c` now have **141**
migrations (0140 applied this session). One unexplained first-run red in
`runNoWire.test.ts` straight after applying 0140, not repeated — § 7b.
**Gate 37877582385 on `c-sch80-500`: test GREEN (full suite, 10m36s);**
drizzle-guard and deploy-staging skipped, as expected on a branch with no
`drizzle/` change. Gate did not run on `c-*` branches before — `gate.yml`
now includes `c-*`, as it already did `a-*`.

## Earlier (2026-10-08, session after) — owner's Sch 80/500 answers recorded; "0 marks" flash fixed

## FROM TRACK A (2026-10-09) — A's Sch 80 / 500 seed IS ON local-dev: merge `c-sch80-500` now

A's seed (`sch80-and-500-plan.md` § 7c, all four items) is on
`origin/local-dev` as **`8f3045c`** (tip `13b0dd9`), and on **staging**
(814/814 bids unchanged; `deploying.md` § 11 "Sch 80 / 500 seed"). Gate
37882505343 green (test, deploy-staging, smoke).

What C needs to know for the merge:

- **A took C's label change and fold sort FILE-IDENTICAL** from
  `c-sch80-500` (`shared/undergroundRunTypes.ts`,
  `client/src/lib/runTypeFold.ts` + `.test.ts`, and the call sites in
  `catalogReview20261008.test.ts`, `catalogReviewSeed.test.ts`,
  `runNoWire.test.ts`, `runTypeExtras.test.ts`), so those merge clean.
  NOT taken: `surfaceRacewayFittings.ts` / its test, `server/db.ts`,
  `sch80And500Runs.test.ts`, `gate.yml` — still C's to land.
- **Expect conflicts** in `server/seed/baselineRunTypes.ts` and
  `server/perFootSeed.test.ts` (A's version is a superset — take A's), in
  `CHANGELOG.md`, this file and `sch80-and-500-plan.md` (docs; keep both).
  `catalogReview20261008.test.ts` now expects 18 underground types and the
  500 type in the "#12 + ground" list.
- Seeded names exactly as § 7c: the nine 500 parts, `Surface raceway, 500
series` (renamed in place — #1683 on staging), the 500 cover retired.
  A's tests: `server/sch80And500Seed.test.ts` (fixture 91354).
- Still C's per § 7c/§ 6: switch the Sch 80 case in
  `sch80And500Runs.test.ts` to the SHIPPED type; once C's family code is in,
  its fixture 500 rows are no longer inserted (they exist); look at the fold
  ("Underground (18)") and the 500 Send dialog on screen.

## LATEST (2026-10-08, session after) — owner's Sch 80/500 answers recorded; "0 marks" flash fixed

**Part 1 — answers recorded, nothing built.** `sch80-and-500-plan.md` § 5
now holds the owner's five answers (clip spacing "not set" for 500 and 700;
separate 500/700 fitting rows; 500 type 2 #12 + ground only; Sch 80 NOT
Specialty; GR2 follows whatever pipe is traced, Sch 80 included), with
`per-foot-items-plan.md` § 7 Q1 and Q5 pointing there. **Wiremold check
(legrand.us, the maker's own pages):** flat elbow (V511 / V711) and inside
elbow (V517 / 717) are series-specific; the parts Wiremold sells as
"500/700" — 5711 twist elbow, V5783/V5784 elbow box connectors, 615 wire
pulley — are none of the nine planned rows, so nothing merges. Coupling,
tee, entrance end, clip, box, plate were not checked part by part; they stay
separate by the owner's rule. **A's 0140 (`a-catalog-review`) IS now on
local-dev** (ancestor of `91df8ea`), so the build may start — re-check the
plan's § 4 against local-dev first.

**Part 2 — the "0 marks" flash (todo.md, smoke step 10 finding).**
`sheetLine` (`client/src/lib/panelTabs.ts`) takes NULL for "not loaded"
and says "This sheet: loading…"; TakeoffPage computes `sheetLoaded` (marks
AND runs answered) and passes null to `ThisSheetLine` in the panel and on
the phone bar; RunsPanel takes a required `sheetLoaded` and its Counts /
Runs empty states show "Loading this sheet's marks/runs…" instead of
"Nothing counted…" until then. Test: `panelTabs.test.ts` +2, red without
the fix. On screen (playwright, marks response held 8 s, Bar layout check 1164558) at 1366×768 and 820×1180: loading → "3 marks · 6 items · 358 ft
of runs", no 0 in between. Script in the session scratchpad, not committed.

**Merged.** track-c `8af794d` Gate 37871005353 GREEN (test, drizzle-guard).
Merged into local-dev as **`cd8db42`** (CHANGELOG conflict with A's catalog
entry: both kept). local-dev Gate 37871700999: **test GREEN,
deploy-staging REFUSED** — "this push changes drizzle/ against what staging
runs: 0140_material_specialty.sql, \_journal.json, schema.ts". That is A's
0140, already on local-dev with its staging code push pending (A's
handoff); A's own `91df8ea` Gate 37870430753 failed identically. Nothing of
C's touches `drizzle/`. **Staging will not carry this fix until Track A
pushes staging**; not C's step.

## EARLIER (2026-10-09) — per-foot work MERGED; three leftovers fixed

**Job 1 — merged.** `c-per-foot-logic` went onto local-dev as ONE squash
commit, **`94d63fd`** (fast-forward of `ee7576c`). Took A's 0139 file and
journal entry, dropped C's stand-in, deleted A's `elbowFlat` tripwire in
`feetForRole` (`elbowFlat` was already in `FITTING_KINDS` from C's 700
code; `pnpm check` clean). **Why squashed:** `drizzle-guard` lists every
non-merge branch commit touching `drizzle/` (`git log --no-merges
origin/local-dev..HEAD -- drizzle/`), so the stand-in commit `92a7ef4` kept
it red even after the merge's tree equalled local-dev's — a merge does not
clear it. Full history stays on `origin/c-per-foot-logic` (merge `8141b66`).
`origin/track-c` was force-pushed (with lease) from that merge to the squash.
E111 1728359 and Bar layout check 1164558: `bids.get` + `bridgeForBid` +
`materialsList.get` + `takeoffSummary.forBid` byte-identical, 261df22 vs the
merge, same `bidrender_local_c`. CI: track-c Gate 37863259085 — test GREEN,
drizzle-guard GREEN. **local-dev Gate 37864063102 GREEN** — test,
deploy-staging, smoke. Staging `/api/version` served `94d63fd` (built
00:32 UTC).

**On staging (2026-10-09 00:40 UTC), through staging's own HTTP API** — no
staging JWT secret on the laptop, so no minted session: a throwaway account
(`track-c-check-<ms>@example.com`, random password not kept; staging email
fails closed) made bid **772**, attached a one-page PDF, traced a 700 run
(40 ft, a square corner, 20 ft, panel → device box, run height 10 ft, ends
5 ft / 1'6") and a 50 ft 2" underground trench, and Send all sent 9, refused
none. Lines: 700 raceway 73.5 ft, coupling 7, entrance end 1, **inside
elbow 1 (`elbow90`), flat elbow 2 (`elbowFlat`)**; 2" PVC 50 ft, **tape 50
ft (`extra`)**, connector 2, strap 10. Identical to the same fixture run
locally. Bid 772 archived (purges in 30 days); the account is left. Script:
not committed (scratchpad) — it is ~90 lines of fetch + the gate HMAC.

**Job 2 — `c-leftovers` (from `94d63fd`), one commit:**

- **a. No wire with no material.** `circuitNeedsPickedWire` in
  `shared/runNoWire.ts` (type, extra count): true when the type names no
  conductor AND says so on purpose — an underground trench (it carries an
  extra) or an empty pipe (count 0). `takeoffRuns.addCircuit` refuses with
  "Use "Pick the wire"…"; `listForSheet` rows carry `pickWireToAdd` from the
  same function, and the open run's circuit editor shows "This run's type
  names no wire." + Pick the wire / No wire (empty pipe) instead of "Add
  wires to this run" (empty pipe: Pick the wire only). **Deliberately NOT
  every no-wire type:** a raceway-only shop type with hand-added circuits is
  the manual way to measure wire (materials list "Wire, insulated"); 19
  existing tests rely on it. Looked at on screen at laptop and 820×1180
  (throwaway bid on the Old Blueridge set, deleted).
- **b. Send-dialog extras keyed by type + material + slot:**
  `run:<type>:extra:<materialId|none>:<extraKey>` (slot too, so two extras
  of one material still differ). `SendTarget` carries `extraKey`;
  `takeoffRunTypes.sendToBid` takes optional `extraKey` and sends that one
  extra. Before: one key twice, and Send all's second item reported "Nothing
  was added" because the first sent both.
- **c. Legend tab at 820×1180.** `phone` in RunsPanel is every touch layout,
  tablet included; its `px-2.5` made the tabs 331 px in a 312 px panel, so
  Legend ended at x=840. Now `px-1` (flex-1 still spreads them; measured
  62–64 px each, strip 311/311). **`pnpm device:audit` gained a hard fault,
  `cutTabs`**: a tab not wholly inside its strip and the window — the
  sideways-strip exemption had hidden it. Red before (3 faults, all
  tablet-portrait), 0 after, plans/plans-totals/capture at all four sizes.

**Tests** (`bidrender_test_c`): `runNoWire.test.ts` (+4: pure rule,
trench refused + `pickWireToAdd`, empty pipe refused, raceway-only still
allowed; the old "refuses an empty pipe on a run that already has wire"
now seeds its circuit with `createRunCircuit`, since addCircuit refuses
one there), `takeoffSummary.test.ts` (+1, two extras), `runTypeExtras.test.ts`
(+1 DB, Send all sends both). Mutation-checked: rule → 3 red; key → 2 red;
send filter → 1 red. 13 touched files, 205 passed. Full suite: CI.

**Not done:** "Pick the wire then a ground" `(2)` twin names (below) still
open.

## EARLIER (2026-10-08, late) — wire on underground runs; tape line checked on screen

Same branch, `c-per-foot-logic`, **still NOT merged into local-dev** (waits
for A's 0139 — the section below still applies word for word). **No new
column was needed**, so nothing here is for Track A.

**How a user put wire on an underground run before this (the owner's
question 1).** Only by editing the TYPE in the picker (pencil → Conductor,
count, ground), which forks it for the whole shop and moves every run of it.
From the warning itself there was no way: a route run's "Add wires" added a
circuit the type named no material for, so the wire row read "can't go on
the bid as it stands"; a quantity trace said "the type says no wire" and
offered nothing. Ignored, **the bid came in without the feeder** — said in
amber, never priced. "Empty pipe" did not exist as an answer at all: a
spare conduit stayed flagged forever.

**What is built (no column — D3(b), the existing per-run "Made of" path):**

- **"Pick the wire"** on the run's no-wire line (route and quantity) opens
  the run's `RunSpecEditor` with its wire, count — and a **ground** slot,
  shown only when the type names no ground (otherwise picking the wire left
  the circuit's ground counted with nothing named: seen on screen). Saving
  goes through `takeoffRuns.respecify`, which points the run at a type
  saying exactly that, found or made.
- **"No wire (empty pipe)"** on the same line and inside the editor:
  `respecify({ emptyPipe: true })` → a type with conductor count **0**
  (already "says no wire" in `typeCarriesWire`; NULL stays "not said").
  `runCarriesNoWire` now takes the type's answer (REQUIRED third argument,
  `emptyPipeLookup(palette)`), so a 0-type run is not flagged; all three
  callers (runs list, summary, plan attention) pass it. Refused, with the
  way out named, on a route run whose circuits already carry wire.
- **The trench keeps its tape.** `respecify` now carries the current
  type's EXTRAS (rule 7 — the editor does not show them): a match must have
  the same extras (`extrasSignature`), and a made type copies them. Before,
  picking a wire for an underground run would have landed it on a tape-less
  type and **dropped the tape off the bid** — the wrong number this job was
  for, from the fix itself. Made types are named
  `2" PVC Sch 40, 2 #6 THHN Copper, underground` /
  `2" PVC Sch 40, empty pipe, underground` (`saysUnderground`); a type with
  other extras gets `+ <extra>`.
- **Send dialog, never stuck:** the "no wire" item reads "N conduit runs
  with no wire picked — No wire picked, so none is priced. Pick the wire, or
  say it is an empty pipe." with a button ("Go to the run and pick its
  wire") that opens the first such run on its sheet with the editor open and
  scrolled into view (`fixAt` on the item, `openRunAt` in TakeoffPage —
  the drops readout uses the same function now).

**Job 2 — the tape line on screen** (playwright, real viewports 1366×768,
820×1180, 1180×820; a throwaway bid on the Old Blueridge set, deleted
after, with its made types). No sideways scroll anywhere; the Send dialog
scrolls its list inside with Cancel/Send on screen at 1366×768. Fixed:
the Runs panel's tape explanation restated the row ("211.12 ft of
Underground warning tape: 211.12 ft over 2 runs…" under "Underground
warning tape 211.12 ft") — now `how`, the sentence without its opening;
the bid note keeps the full `why`. The Send dialog showed tape = pipe feet
with no word on why — it now carries the `how` under extra lines (`note`).
Picker opened below the fold after the jump — now scrolls into view.

**Seen, not changed:** at 820 wide the panel's tab strip runs "Legend" past
the right edge (pre-existing; not checked whether it scrolls). The open
run's own "Add wires to this run" (circuit editor) still adds a circuit on
a type with no wire named — it then reads "can't go", visible, not silent.
`takeoffSummary` keys a run row `run:<type>:<role>`, so a type with TWO
extras would collide on `run:<type>:extra` — one shipped extra today, but
it needs the extra key before a second ships. Picking wire without a ground
and later with one makes a `(2)` twin name (labels do not name the ground).

**Numbers:** HEAD `4147269` vs this tree, same `bidrender_local_c`, read
only — `bids.get` + `bridgeForBid` + `materialsList.get` +
`takeoffSummary.forBid`: identical on E111 1728359 (pipe 3,996.04 ft) and
Bar layout check 1164558 ($378.15, 7 lines) except the reworded no-wire item
and its new `fixAt` (and the list's timestamp). Note E111 1728359 is owned
by local user 22173517 — run it as that user.

**Tests** (`bidrender_test_c`): `runNoWire.test.ts` (+6, incl. 5 DB: asks,
empty pipe keeps tape and reuses its type, picked wire priced with tape,
ground named and sendable, refusal), `runRespecify.test.ts` (+8),
`takeoffSummary.test.ts` (+2), `runExtrasPerFoot.test.ts` (`how`).
**Mutation-checked, 13 of 13 red.** CI: Gate 37857115190 (`8277522`, pushed to `track-c`) — `test` GREEN, `drizzle-guard` red by rule until A's 0139. The local full-suite rerun was stopped for low memory; the earlier full run was 5978 passed with one failure, in a test edited while it ran, which passes now.

## WHERE THINGS STAND (2026-10-08, before the section above — still true)

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
