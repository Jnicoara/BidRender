# Next live release — PLAN ONLY (Track A, 2026-10-08)

**Nothing here has been run against live.** This is what a release of
today's `local-dev` would carry, what it would run, the rules it must keep,
what to check first, and what must wait. The day-of checklist is still
`references/live-release-plan.md` (pairing rules at its top, the sequence in
§ 4); this file says what is different now and adds what that one does not
yet know. Owner's yes is needed before `main` is pushed.

**Every count below was read on 2026-10-08 from git and the repo.** If what
a command prints on the day does not match a number here, **stop and find
out why before going on** — either this file is stale or the system is not
in the state it describes, and those want opposite responses.

## 1. Where things stand

> **2026-10-09:** the latest rehearsal is § 5e (36 migrations, catalog
> review, Sch 80 / 500 seed, cover repair). The table below is from
> 2026-10-08; re-read `origin/local-dev` for the gap on the day.

| What      | State (2026-10-08)                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Live      | `24105ad` (`origin/main`), database 0000–0104 (105 migrations)                                                                |
| Staging   | follows `local-dev`; database 0000–0140 (141) since 2026-10-09 01:10 UTC, all applied before their code (`deploying.md` § 11) |
| Gap       | `git log --oneline origin/main..origin/local-dev \| wc -l` = 207 at `8913918` (merges and docs included)                      |
| Candidate | not chosen. Must be a commit with a green Gate (test, deploy-staging, smoke) — `live-release-plan.md` § 0 if not the tip      |
| Last Gate | `8913918` (B's cover swaps merged): Gate 37858600880 green, 2026-10-08                                                        |

## 2. What is on staging and not live — by theme

From `git log --no-merges origin/main..origin/local-dev`, docs-only commits
left out. One line per theme; the commits say the rest.

**Pricing honesty (Track B)**

- Labor with $0 / unset material is never "fully priced" (`5c98bd1`), with
  the **"Labor only"** tick that clears it and the frozen
  `snapshotLaborOnly` (`d8a0235`, 0105–0106).
- Assembly hours can be **"not set"** (NULL, never a silent 0); totals count
  missing hours apart from unpriced parts; the proposal says "Hours pending"
  (`882ee8e`, `1d4c322`, `4ebb0c6`, `f94d06e`, `26ad0be`; 0122–0123).
- **"Never stuck"**: every Needs price / Needs hours / Needs rate warning is a
  button that opens the editor on that field (`9434268`, `f9e8201`).
- **Example tags** — "Example price / hours / rate" on the bid screen only,
  print warning, example loaded labor rates (Foreman $70.50, Journeyman
  $59.22, Apprentice $36.66, Helper $33.84) with the wage breakdown
  (`4401c55`; 0132–0134).
- "Most used" row in both assembly pickers (`70712fc`, `b6a2dd1`).

**Starter library and catalog (Tracks A, B)**

- 183 starter assemblies (the assembly-hours sheet's count; most with hours
  not set), two new shelves
  Demo & Retrofit and General (0122), the Assemblies-screen fix that showed
  them (`932cb53`), 15 more by part key (`beb9a73`), DV34 surface raceway
  receptacle now loads (`7641bb1`).
- Catalog: 151 renames IN PLACE (`3a6423e`), 159 adds (`8feffb7`), the 103-row
  cover family (`3eefc35`) — 1,818 shipped rows; three new material shelves
  (0117). Search: count words, wire head nouns, and today's bare-gang mix
  (`a3d7937`).
- The seed value files (`starterPrices.ts`, `starterLaborUnits.ts`,
  `starterAssemblyHours.ts`) are still EMPTY — no shipped price or hour
  moves in this release.

**Plan viewer and takeoff (Tracks B, C)**

- Homerun footage: panels, circuits, ceilings and height areas, drops,
  extra bends, "Box to box" (Track C, 0125–0131).
- Read-only overlays on vector sheets: tie labels, CAD layers, demolition
  plans, schedules, homeruns, circuits from tags, scale check.
- Large plan sets no longer download whole in the background (`47c3520`).
- Three smoke flakes fixed as real bugs: blank Plans after reload, a mark
  lost on reload, a click between answer and re-render (`b64e504`).
- Height-type rename saves what is in the box (`c42d3a2`).

**Server and sign-in**

- Reset page says a dead link is dead on open (`6518fc5`); reset logs why
  nothing was sent (`4a76181`); slow-request logging (`c0f7fbe`).

## 3. Migrations a live release would run: 0105–0141 (37 files)

> **Grew 2026-10-09 (later): 0141** (`0141_ai_service_status`, one new
> table for "a dead AI key says so" — additive, on staging, `deploying.md`
> § 11 "0141"). **Expect 37 applied, 142, matches, 176/176** (the table has
> no foreign key). § 5e rehearsed 36; 0141 was rehearsed on staging's copy
> only. The counts below that say 36 / 141 are the 0140 figures — read them
> as 37 / 142. If what prints differs, stop and find out why.

> **Grew again 2026-10-09 (session 25): 0140** (`0140_material_specialty`,
> `materials.isSpecialty`, the owner's catalog review — additive, on
> staging). **The § 5c rehearsal was of 35; it must be RE-RUN with 36
> before the release** — expect 36 applied, 141, matches, 176/176. The
> catalog review's seed content (138 retired, 107 added, 23 renamed, 108
> Specialty, the run-type ground swap and the 3-1/2" type archived) runs on
> the new code's FIRST BOOT, so the re-rehearsal also boots that code on
> the copy and compares the catalog (`scripts/catalogRehearsal.mts`) and
> the totals (§ 5d).

> **Grew 2026-10-08 (sessions 21 and 23):** 0135–0138 (per-foot items
> M1–M4) and **0139** (`0139_elbow_flat_role`, the `elbowFlat` role)
> joined the batch, both on staging (`deploying.md` § 11). The
> rehearsal in § 5b was of the thirty only. **Re-rehearsed with all 35 on
> 2026-10-08 (§ 5c): 35 applied in 4.1 s, 140, matches, 176/176, no
> errors.** The "30 / 135 / 173" figures in § 5b are the thirty's, kept as
> the record of that run.

All thirty-six are **step 1, additive** — no `UPDATE` to an older column —
per `migrations-next-batch.md` and the staging records in `deploying.md`
§ 11. So all go on BEFORE the push, in one run, in order.

| Files     | What                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0105–0106 | `assemblies.laborOnly`, `bid_line_items.snapshotLaborOnly`                                                                      |
| 0107–0116 | invites, AI correction log, sheet hash/height, assembly + group columns, label words, quotes, `lineRole`, markup                |
| 0117–0124 | catalog shelves (0117), locknut/bushing, `parentId` + FK, brand, assembly shelves (0122), nullable hours (0123), legend entries |
| 0125–0131 | Track C: `bid_panels`, `bid_panel_circuits`, homerun settings, run-circuit panel, height areas, bends + `runsAt`                |
| 0132–0134 | example price / hours / labor-rate flags and wage parts                                                                         |
| 0135–0138 | per-foot items M1–M4: `takeoff_run_type_extras`, `extra` role + `runExtraKey` key swap, `qtySource`, traced-part JSON           |
| 0139      | `elbowFlat` appended to `bid_line_items.runMaterialRole` (the 700 flat elbow)                                                   |
| 0140      | `materials.isSpecialty` — the catalog review's Specialty tag (sorts lower in search; no total reads it)                         |
| 0141      | `ai_service_status` — one row: whether AI calls are being refused (dead key), for the admin AI screen                           |

- **Expect: "Applied 36 migrations", then 141; a second run applies nothing;
  `schemaDrift` "matches"; foreign keys 176/176** (staging's number,
  2026-10-09 after 0140). If any differs, stop and find out why — either
  this line is stale or live is not where you think.
- **0136 swaps a unique key too** (`bid_line_items_bid_runtype_role_uq` →
  `…_role_extra_uq`, ADD before DROP in one statement). Rehearsed on staging's
  copy.
- **0115 swaps a unique key** on `bid_line_items` (`bid_group_uq` →
  `bid_group_role_uq`). Rehearsed; the one file worth reading twice.
- **Order is a hard rule:** the migrator skips a file whose `when` is older
  than the newest applied. Never apply 0132–0134 without 0125–0131 first, and
  never a subset of the thirty-six.
- **Step 3 — nothing in this release.** Folding the "EXISTING TO REMAIN"
  twins and clearing the 8 starters' hours wait until this code is LIVE.

## 4. Pairing rules that apply (`live-release-plan.md` top)

1. **Labor only** — 0105–0106 only WITH B's rule, the tick and the reading
   code. Met on `local-dev`. On the day: `git grep -n snapshotLaborOnly
<candidate> -- shared server client/src` shows the readers.
2. **Hours not set** — 0122–0123 only with B's NULL-hours code. Met.
   **Changed:** that rule expects ONE "Holding" line (DV34) on first boot.
   Since `7641bb1` DV34 loads, so expect **zero** holds. A hold now means a
   part went missing — stop.
3. **Homerun footage** — 0125–0131 only with C's code. Met: merged in
   `bea4d8f`, and `bids.homerunRunTypeId` is resolved in
   `forkableReferences.test.ts` (no longer "unreviewed").
4. **Catalog shelves** — 0117 before any build seeding Surface Raceway /
   Underground / Service Entrance rows. Covered by applying all thirty first.
5. **Example tags** (`migrations-next-batch.md` Batch 5) — the example
   rates never without `isExampleRate`, the shipped hours never without the
   hours tag; 0132–0134 after 0125–0131 in one step.

**One bid number moves on purpose:** at the first boot the shipped field
roles go from $0 to the example rates. Existing lines keep their frozen
rate; only NEW lines on a shop still using starter rates get real labor.
`bidTotals` must show **every existing bid unchanged** — a moved total is a
FAIL. (B's labor rule may raise "not priced" counts on labor-with-$0-material
lines: expected, and labelled as such in § 1b of the checklist.)

## 4b. A release step after the push: the starter cover repair

Track B's cover swaps (`7fb0c80`, `cover-plates-audit.md` § 3) change the
seed recipes, but the seeder never edits a starter that already exists. So
on live the starters seeded before the swap keep the generic "Wall plate"
until `scripts/repairStarterCovers.mts` runs. It is a hand step, run by
Track A, never a boot step (`server/starterCoverRepair.ts`).

**When: AFTER the new code's first boot on live**, not straight after the
migrations. The typed cover rows ("1-gang wall plate, duplex, nylon" etc.)
are catalog rows the new code SEEDS when it starts; before that boot the
script answers "skipped: part not in catalog" for every starter, and the
175 starters live does not have yet are not there either. So, in the
`live-release-plan.md` § 4 sequence: migrate → push → watch the deploy and
`/api/version` → **cover repair** → `bidTotals` after.

```bash
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/repairStarterCovers.mts           # report only
ALLOW_REMOTE_DATABASE=yes DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/repairStarterCovers.mts --apply
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/repairStarterCovers.mts           # again: expect 48 already has it
```

**Expect (from § 5c, on the 2026-10-08 copy of live): report only says
`5 would swap, 43 already has it`** — DV1–DV5, live's original starters
ids 1–5, each "old recipe exactly" with no company copies; the other 43
were seeded on the new recipe by the boot. `--apply` says `5 swapped`; a
second run says `48 already has it`. Any `skipped: edited`, `skipped: not
found` or `skipped: part not in catalog`, or a different split, is a stop:
either live changed since the copy (a company edited a starter, or the
boot did not finish seeding) or this line is stale — find out which first.
It writes only shared starter lines, so `bidTotals` after must still show
every bid unchanged.

## 5. Check first — before the window

1. **Owner's yes** to release, and to which candidate commit.
2. **Green Gate on that exact commit** (test, deploy-staging, smoke).
   ~~Smoke step 10 (undo a mark) is flaky~~ — **DONE 2026-10-08 (`27d5ca0`).**
   It was the test, not undo and not a redeploy: step 10 read the mark count
   while the sheet was still loading ("0 marks"), so it judged undo against a
   wrong start (`todo.md` top). Fixed and FORCED (the slow load now happens
   every run); Gate 37845117225 green, then its smoke re-run against staging
   5 of 5 green. **A red step 10 is now a real failure — do NOT re-run past
   it**; find out why first.
   ~~Smoke test 2 (empty sheet list after a first upload)~~ — **CLEARED
   2026-10-09 by Track B**:
   - Fixes: `526d295`, then `11f5466`, the half that mattered (cancel the
     first sheet read in flight before re-reading).
   - Before the fix: 2 of 12 failed on a staging probe. After: **0 of 24**.
   - Test 2 green in all 10 smoke runs since (Gates 37960082974 and
     37970377380 with 3 re-runs each, plus A's two Gates).
   - **The candidate must contain `11f5466`.** A red test 2 is now a real
     failure, so do not re-run past it.

   **Two OTHER smoke tests each failed once in those 10 runs**, with no
   deploy running (`track-b-handoff.md`, todo.md):
   - screens / Proposal: an unbounded network-idle wait. Bounded in
     `739eae6`.
   - flow test 5: a Legend click that did not arm. ~~Cause NOT found.~~
     **FOUND AND FIXED 2026-10-09 (`44ede4f`, merged as `705e1c9`) — a real
     wrong count, not a flake. MUST-INCLUDE for the candidate.** A Legend
     click straight after "Link" could arm ANOTHER item's count of the same
     assembly (the server dropped the not-yet-linked symbol). **LIVE
     (`24105ad`) has this race** — same `forAssembly` line, same optimistic
     link. Flow 5 now forces it every run (red without the fix), so a red
     flow 5 is a real failure: do not re-run past it. Gate 37983875286 on
     `705e1c9`: all green, smoke included.
     **On the day, before the release:** run
     `scripts/legendLinkRaceCandidates.mts` against live (read only, § 5
     item 4b) — it lists every bid the race could have touched.

   Either can turn the candidate's Gate red. If one does, read the failure
   before re-running.

3. ~~The white box on plan open~~ — **FIXED by Track B (`14fead9`, batch 1)**: `stagingOpenFlash.mts` prints "No flash" on staging at laptop and
   tablet (`todo.md` § White box). ~~Track B's cover swaps~~ — **on
   local-dev (`7fb0c80`)**, with the repair script in § 4b.
4. **Read-only recount on live**: lines with `assemblyId IS NOT NULL AND
snapshotUnpricedParts IS NULL AND archivedAt IS NULL` — must be **0**
   (it was 0 on 2026-10-07). Otherwise freeze first (`todo.md`
   "WRONG-NUMBER RISK: older bid lines read their assembly's recipe LIVE").
4b. **Read-only check for the Legend-link race on live** (`44ede4f`):
   `DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/legendLinkRaceCandidates.mts`.
   It prints CANDIDATES (a mark does not record which symbol placed it):
   "no candidates" ends it; any row means opening that bid's sheets and
   looking for one count's marks on two different symbols. Live had 2 bids
   on 2026-10-06, both with no lines, so the expected answer is none — if it
   prints rows, stop and look before releasing.
5. **Backup of live**, restored locally, table counts equal; rehearse the
   thirty-five on that copy (apply, re-run, drift, `bidTotals` before/after
   with the candidate's code booted, the starter count with zero holds, the
   cover repair). **Done on `8913918` 2026-10-08 (§ 5c)** — repeat only if
   the candidate's `drizzle/` or seed differs from that.
6. `git status --porcelain` empty, `pnpm check` clean, read
   `git log main..<candidate> --oneline` in full.
7. After the push: `curl -s https://bidridge.com/api/version` — `commit` and
   `builtAt`, not the version tag.

## 5b. Rehearsal on a copy of live — DONE 2026-10-08 (nothing changed on live)

Track A, 05:35–05:45 UTC. Live was only READ (one `mysqldump` through
`scripts/backup.mts`); every write below was to a local throwaway copy.

| Step                           | Result                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backup                         | `2026-10-08T05-35-31Z` in `r2://bidsoftware/helixbid`: 65 tables, 3,479 rows, 5/5 files (324.3 MB). One warning: "ai_correction_log.cropKey is not in this database — skipped" — the backup code on `local-dev` knows 0108's table; live does not have it yet. Expected.                                                       |
| Restore                        | `verifyBackup.mts` with `KEEP_SCRATCH=1` into local `bidrender_backup_verify`: **VERIFIED**, 65 tables / 3,479 rows, equal to the manifest. 105 migrations.                                                                                                                                                                    |
| Live data, for scale           | 3 users, **2 bids** (23 "Decant Facility", 25 "Viewer batch check (smoke)"), **0 bid lines**, 8 shared assemblies, 1,574 materials.                                                                                                                                                                                            |
| Recount (pre-0087 recipe-live) | **0** — `bid_line_items` with `assemblyId IS NOT NULL AND snapshotUnpricedParts IS NULL AND archivedAt IS NULL`. (0 assembly lines at all.) No freeze needed first.                                                                                                                                                            |
| Drift before                   | 105 recorded; the missing tables/columns are exactly 0105–0134's.                                                                                                                                                                                                                                                              |
| `bidTotals` before             | from live's code `24105ad` (worktree): 2 bids, read-only proved (MySQL refused a write).                                                                                                                                                                                                                                       |
| Migrate 0105–0134              | **"Applied 30 migrations: 0105_assembly_labor_only to 0134_example_labor_rates … all 135." No errors. 4.5 s** wall time including `tsx` start-up (timed on a second restore of the same backup; the first run's timer failed). Re-run: "Nothing to apply".                                                                     |
| Drift after                    | **"Database matches the schema." Foreign keys 173 present, 173 declared.**                                                                                                                                                                                                                                                     |
| Boot `local-dev` (`3a1f3ef`)   | Started clean, no error lines. **183 shared starters, 0 "Holding" lines** (DV34 "Surface raceway receptacle (block wall)" present), 175 with hours NULL, **0 at 0 h**. Example rates seeded: Foreman 70.50, Journeyman 59.22, Apprentice 36.66, Helper 33.84; Supervisor and PM unrated. 1,820 shared materials, 1,818 active. |
| `bidTotals` after + compare    | **"all 2 bid(s): totalDue unchanged; not-priced and incomplete unchanged."**                                                                                                                                                                                                                                                   |
| Bids opened                    | `bids.get` through the running server as each owner: bid 23 and bid 25 both open, 0 lines, every total $0, no problems — the same as before.                                                                                                                                                                                   |

**What this rehearsal cannot show, said plainly.** Live has 0 bid lines, so
"every total unchanged" compares $0 with $0 on two bids — it proves the
migrations and the first boot do not break a bid, not that pricing survives
them; that was proved on staging's 511 bids (`deploying.md` § 11). Plans
were not opened: live's files are in R2 and the copy was served from disk.
**Expect on the day:** 30 applied, 135, matches, 173/173, 0 holds, 183
starters. If any of these differs, stop and find out why before going on —
either this table is stale (something merged since) or live is not in the
state measured here.

The throwaway copy `bidrender_backup_verify` and the `../bidrender-before-1008`
worktree were removed afterwards.

## 5c. Re-rehearsal with all 35 + the cover repair — DONE 2026-10-08 (nothing changed on live)

Track A, 23:54–00:10 UTC, code `local-dev` = `8913918` (0139 and B's cover
swaps in). Live was only READ, through `scripts/backup.mts`; every write
was to the local throwaway copy `bidrender_backup_verify`, dropped after.

| Step                           | Result                                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup                         | `2026-10-08T23-54-07Z` in `r2://bidsoftware/helixbid`: 65 tables, 3,479 rows, 5/5 files (324.3 MB). Same one warning as § 5b (0108's `ai_correction_log` is not on live yet). Live's data is the same size as in § 5b.                            |
| Restore                        | `verifyBackup.mts`, `KEEP_SCRATCH=1`: **VERIFIED**, 65 tables / 3,479 rows. 105 migrations. 3 users, 2 bids, **0 bid lines**, 8 shared assemblies (38 lines), 1,574 materials, 0 company assemblies, 0 forks.                                     |
| Recount (pre-0087 recipe-live) | **0** before the migration and **0** after the repair.                                                                                                                                                                                            |
| `bidTotals` before             | from live's code `24105ad` (worktree, today's `bidTotals.mts` copied in): read only proved, 2 bids for 2 owners.                                                                                                                                  |
| Migrate 0105–0139              | **"Applied 35 migrations: 0105_assembly_labor_only to 0139_elbow_flat_role … all 140."** No errors. **4.1 s** wall time incl. `tsx` start-up (timed on a second restore of the same backup). Re-run: "Nothing to apply … all 140".                |
| Drift after                    | **"Database matches the schema." Foreign keys 176 present, 176 declared.**                                                                                                                                                                        |
| Boot `8913918`                 | Started clean, no error or "Holding" lines. **183 shared starters**, 940 starter lines, 1,826 shared materials (1,844 rows in all).                                                                                                               |
| Cover repair, report only      | **`5 would swap, 43 already has it`** — DV1 Duplex receptacle standard (1), DV2 GFCI (2), DV3 Dedicated 20A (3), DV4 Single-pole switch (4), DV5 Dimmer (5), all "old recipe exactly". Nothing skipped.                                           |
| Cover repair, `--apply`        | `5 swapped`. Measured both sides: in each of ids 1–5 ONLY the "Wall plate" line changed, on the same line id and place (duplex/decorator/toggle nylon plates per B's table). The other 914 starter lines hash identical; assembly rows identical. |
| Cover repair, second run       | **`48 already has it`** — changes nothing. Dry run takes ~1.7 s.                                                                                                                                                                                  |
| `bidTotals` after + compare    | **"all 2 bid(s): totalDue unchanged; not-priced and incomplete unchanged."**                                                                                                                                                                      |

**Same honest limit as § 5b:** live has 0 bid lines and 0 company
assemblies, so "totals unchanged" is $0 against $0 and "only exact old
recipes" was never put to the test by an edited starter here. Both were
proved where the data exists: B rehearsed the repair on staging's copy (48
swapped, 732 totals unchanged, `7fb0c80`), and `server/starterCoverRepair.test.ts`
covers the edited and forked cases.

**Expect on the day:** 35 applied, 140, matches, 176/176, 0 holds, 183
starters; repair 5 / 43, then 48. If any differs, stop and find out why.

## 5d. Re-rehearsal with 0140 and the catalog review — TO DO before the release

The § 5c run predates 0140 and the owner's catalog review (session 25,
`references/catalog-review-2026-10-08.md`). The review changes nothing in
a migration except one nullable column; its weight is in the SEED, which
runs on the new code's first boot. So the re-rehearsal is § 5c's steps
plus a catalog before/after, on a fresh copy of live:

1. Backup + verify, restore to a scratch database (as § 5b).
2. `scripts/catalogRehearsal.mts snapshot before.json` on the copy;
   `bidTotals.mts` before, from the code live serves.
3. Migrate: **expect 36 applied, 141**, re-run nothing, matches, 176/176.
4. Boot the candidate on the copy (or `scripts/seedBaseline.mts`, the
   same seed), twice. `catalogRehearsal.mts snapshot after.json`, then
   `compare`. **Expect** on live's catalog (which predates the
   2026-10-07 rename and adds): renamed rows grouped by round, the review's
   23 among them where live has the row; retired = the review's rows live
   holds (IMC, #14/#12/#10 bare, the generics — live never had 3-1/2");
   DELETED 0; company rows unchanged; old spellings 0; duplicates 0; every
   reference identical EXCEPT `takeoff_run_types.groundMaterialId` on the
   shipped "#12 + ground" types (moved to #12 THHN green, by design). A
   second boot: nothing changes.
5. `bidTotals.mts` after, with the candidate: every total unchanged.
6. Then the cover repair (§ 4b).

Staging's own run of exactly this is `deploying.md` § 11 "0140" (rehearsed
on a copy, 773/773 unchanged; staging 781/781 unchanged after the migration).
If anything differs, stop and find out why.

**DONE 2026-10-09 — see § 5e**, with the Sch 80 / 500 seed added.

## 5e. Re-rehearsal with 0140, the catalog review AND the Sch 80 / 500 seed — DONE 2026-10-09 (nothing changed on live)

Track A, 04:00–04:10 UTC. Candidate code: `a-sch80-500` `8f3045c`
(`local-dev` `c1e7b35` + the Sch 80 / 500 seed, `sch80-and-500-plan.md`;
no migration in it). Every write was to the local throwaway copy
`bidrender_backup_verify`.

**The copy is NOT a fresh read of live.** A new `scripts/backup.mts` run
against live was refused by this session's permission classifier
("Production Reads"), so the copy is the NEWEST backup in the bucket,
`2026-10-08T23-54-07Z` — the one § 5c took by hand, about four hours old
at the time; no nightly had run since. Live is three users and two bids,
so a change in four hours is unlikely, but it was not measured. **On the
day, the release's own backup (`live-release-plan.md` § 4) is the fresh
read; if it differs from the figures here, stop and find out why.**

| Step                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore                        | `verifyBackup.mts`, `KEEP_SCRATCH=1`: **VERIFIED**, 65 tables / 3,479 rows. 105 migrations. 3 users, 2 bids, **0 bid lines**, 8 shared assemblies, 7 run types (4 shipped, 1 company, 2 archived smoke copies), 1,554 active shipped materials, 18 company rows. No surface raceway rows at all (0117 is not on live).                                                                                                                                                                                                                                    |
| Recount (pre-0087 recipe-live) | **0** before the migration and **0** after the repair.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `bidTotals` before             | from live's code `24105ad` (worktree, today's `bidTotals.mts` copied in): read only proved, 2 bids for 2 owners.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Migrate 0105–0140              | **"Applied 36 migrations: 0105_assembly_labor_only to 0140_material_specialty … all 141."** No errors. Re-run: "Nothing to apply … all 141". (Not timed this run; § 5c's 35 took 4.1 s.)                                                                                                                                                                                                                                                                                                                                                                  |
| Drift after                    | **"Database matches the schema." Foreign keys 176 present, 176 declared.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| First boot (seed) ×2           | `scripts/seedBaseline.mts` (the boot's own function), exit 0 both times, no "Holding" line. **1,801 active shipped** (1,908 rows), **24 shipped run types**, **183 starters** (175 hours NULL), 108 Specialty. Second boot: added 0, renamed 0, retired 0, every reference identical.                                                                                                                                                                                                                                                                     |
| `catalogRehearsal compare`     | added 352, renamed 173 (earlier rounds + the review), retired 105, **DELETED 0**; old spellings 0; duplicates 0; company rows 18 → 18, changed 0. Its verdict line says "NOT CLEAN" because reference COUNTS grew (903 new starter lines, 20 new run types); checked row by row from the two snapshots: **every pre-existing reference identical except** run types 2 and 3's ground, `#12 bare solid Copper` → `#12 THHN green Copper` — the intended swap. The smoke account's own copy (type 7) still on #12 bare: a company row, untouched by design. |
| Sch 80 / 500 content           | 9 `N" PVC Sch 80, underground` types, all 9 with tape; 18 active underground types; `Surface raceway, 500 series` (foot) + its 9 parts (each); the 500 type on that row with `#12 THHN green Copper` as ground. Live never had the 500 base or cover, so the rename and retire are no-ops there — the rows simply arrive new.                                                                                                                                                                                                                             |
| `bidTotals` after + compare    | **"all 2 bid(s): totalDue unchanged; not-priced and incomplete unchanged."**                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Cover repair                   | report **`5 would swap, 43 already has it`** (DV1–DV5, ids 1–5, "old recipe exactly"); `--apply` **5 swapped** — measured both sides, only the "Wall plate" line on each of ids 1–5 changed (duplex/decorator/toggle nylon), same line ids; re-run **`48 already has it`**; `bidTotals` still all 2 unchanged.                                                                                                                                                                                                                                            |

**Same honest limit as § 5b/5c:** live has 0 bid lines, so "totals
unchanged" is $0 against $0; pricing survival was proved on staging's
bids (`deploying.md` § 11).

**Expect on the day:** 36 applied, 141, matches, 176/176; first boot 0
holds, 183 starters, 1,801 active shipped, 24 shipped run types; repair 5 /
43, then 48. If any differs, stop and find out why.

> **Changed 2026-10-09, later — the coverage-check catalog adds (§ 5f).**
> A candidate that includes `3cb5df3` ships **24 more rows: expect 1,825
> active shipped and 114 Specialty** on live's first boot, not 1,801 / 108.
> Seed only, no migration, additive (renamed 0, retired 0), so § 5e's
> migration and repair figures are unchanged. § 5e itself was NOT re-run
> with them; they were rehearsed on a copy of STAGING (§ 5f), which holds
> the same catalog live will reach after this release's first boot.

## 5f. The coverage-check catalog adds (24 rows) — rehearsed on staging's copy, 2026-10-09

Owner-approved rows from `coverage-check.md` (track-c), `3cb5df3`:
receptacles (6-15R, 6-20R, 6-30R, 6-50R, L15-30, L21-30, red emergency,
pop-up countertop), wall and floor heat (4), 4/3 NM-B, HCF MC cable,
meter centers (4, 6), switchboards (400/600/800A), handhole, dock light,
cord reel, telecom backboard and busbar. CT cabinet already shipped. No
migration; the seed adds them on the first boot.

| Step                         | Result                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup                       | `staging-2026-10-09T05-13-27Z-before-coverage-rows.sql` (73 tables), restored locally: 847 bids, 438 lines, 1,801 active, 141 migrations       |
| Before (staging's `94471cc`) | `bidTotals` 847; catalog 1,941 rows / 1,801 active. Control: booting that same code changed no total (847/847)                                 |
| New code's boot ×2           | **added 24, renamed 0, retired 0, DELETED 0**, 1,825 active, 114 Specialty, every reference identical — `VERDICT: CLEAN`; second boot: nothing |
| Totals                       | **847/847 unchanged**                                                                                                                          |

Staging itself: `deploying.md` § 11 "coverage-check catalog adds".

### Still missing before the release (2026-10-09)

- **Owner's yes** and the candidate commit; then a green Gate on exactly
  that commit (test, deploy-staging, smoke). The candidate must include the
  Sch 80 / 500 seed if it is to match § 5e, and Track B's `11f5466` (smoke
  test 2's fix, § 5 item 2). **It MUST include `705e1c9`** (the Legend-link
  fix, `44ede4f`) — live has that race today (§ 5 item 2) — and § 5 item 4b
  runs against live on the day.
- ~~Smoke test 2 proven fixed~~ — **done 2026-10-09** (§ 5 item 2).
- **Owner's tablet look at staging** (the third of the owner's three
  waits; the white box and the cover swaps are done).
- **A fresh backup of live on the day** — this session could not take one
  (above); the release's own backup is that read.
- The recount (§ 5 item 4) on LIVE itself on the day — the 0 here is the
  copy's.
- ~~The cover repair has NOT been run on staging~~ — **done on staging
  2026-10-09** (48 swapped, 794/794 unchanged; `deploying.md` § 11 "0140"
  step 6).
- Track C's half of Sch 80 / 500 (`c-sch80-500`: the 500 fitting family, the
  fold sort's other callers) merges after this seed; until it does, a 500
  run's fittings say "no catalog match" — an honest blank, no wrong number.
  The release candidate should carry both or neither of the 500 halves.
- Not blockers, logged by session 22 in `todo.md`: the tally saying
  "0 marks" while loading (Track C has since fixed it, `cd8db42`).

## 6. What should wait (NOT in this release)

- **The LT1/LT2 repair script** — moves a number on old lines; waits for the
  `snapshotUnpricedParts` freeze.
- **Any shipped price or hour** from the owner's sheets — the seed files stay
  empty in this release; they load later through
  `pricing/loadStarterSheets.mts`, behind their tags, and also wait on that
  freeze (a recipe/price change re-prices recipe-live lines).
- **Brand variant prices** — wait on `materials.parentId` being read
  (0119 lands, nothing prices from it yet).
- **Step 3 files** (twins fold, 8 starters' hours to NULL) — after this code
  is live.
- **Track C's "extra per-foot items on a run" plan** (`1bf619d`, warning
  tape / 700 cover) — plan only, no code, no migration.
- **Before beta** sign-in protection (`todo.md`) — not built.

## SHORT SUMMARY

- Live `24105ad` / 0104; staging = `local-dev` / 0140.
- A release runs 0105–0140 (36, all additive) before the push, in one
  ordered run; expect 141, matches, 176/176 FKs. \*\*Re-rehearsed with all 36
  - the catalog review + the Sch 80 / 500 seed + the cover repair on
    2026-10-09 (§ 5e)\*\*: clean; 1,801 active shipped, 24 run types, 183
    starters, 0 holds, only the intended ground swap moved, repair 5 / 43 →
    48, both bids unchanged. The copy was the 2026-10-08 23:54 backup (a fresh
    read of live was refused this session).
- Coverage-check catalog adds (`3cb5df3`, § 5f): +24 rows, seed only —
  expect **1,825 active / 114 Specialty** on the first boot if the
  candidate includes them. Rehearsed on staging's copy: CLEAN, 847/847.
- NEW release step after the push and first boot: `repairStarterCovers.mts`
  (§ 4b) — expect 5 swapped (DV1–DV5), 43 already, then 48 already.
- Pairing rules 1–5 all met on `local-dev`; rule 2 now expects ZERO holds
  (DV34 loads).
- Check first: owner's yes, green Gate on the candidate, owner's tablet
  look, a fresh live backup, live recipe-live recount = 0. White box, cover
  swaps and the staging cover repair are done.
- Wait: LT1/LT2 repair, any shipped prices/hours, brand prices, step 3,
  C's per-foot extras plan.
- Rehearsed on a copy of live 2026-10-08 (§ 5b): recount 0, 30 applied in
  4.5 s, no errors, matches 173/173, 0 holds / 183 starters, both bids
  unchanged and open. Live has 0 bid lines, so totals prove little there.
