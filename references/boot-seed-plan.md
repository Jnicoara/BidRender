# Boot seed change — the start stops rewriting the shared starter. PLAN ONLY

Track A, 2026-10-13 (session 40). Nothing here is built. It is the "boot
change" in `baseline-screen-plan.md` § 6 and § 9 F2–F6, and step 3 of § 11's
order ("after this, a deploy can no longer reach a company's library").

**Why now:** C built `applyStarterChange` (`server/starterChanges.ts`,
`1ac7487f`) and said, in its header and in `track-c-handoff.md` (START HERE,
2026-10-13 night, item 3): **do not wire a caller on a shared database before
this change.** Today the next server start writes the seed's value back over
a logged change, with no log. Pinned companies keep the old value; every
other company silently reads the seed's again.

Decisions this builds on (cited, not re-opened): the owner's rule (plan § 0),
pin-then-offer (§ 2), field kinds (§ 3, coded in `shared/starterChange.ts`
`STARTER_FIELDS`), names are offers (Q17), finding fields reach everyone
(Q21), hide never deletes (§ 3), a start never writes a company's own row
(session 33, `bootLeavesCompanyRows.test.ts`).

**This overrides one standing decision, and both files must say so**
(CLAUDE.md § "Where decisions live"): CLAUDE.md § "Where a priced catalog
lands: THE SEED FILES" (2026-09-21) says a seed price "reaches every existing
database on the next deploy, with no migration" and is "re-applied if anything
ever edits a baseline row by hand". After this change the seed file still
AUTHORS the starter and still builds a brand-new database whole, but it
reaches an EXISTING database only when somebody confirms it, through
`applyStarterChange` (source `seed`). The CLAUDE.md amendment ships in the
same commit as the code, with the old text kept and the reason given.

---

## 1. What the boot does today, on every start (measured by reading, `local-dev` `b11abf2e`)

`server/_core/index.ts:184` → `seedShippedLibrary` (`server/seedShippedLibrary.ts`):
materials ‖ labor rates ‖ modifiers, then assemblies → kits → run types,
then labor steps. Every write below is `userId IS NULL` (shared rows) — the
company-row writers were removed in session 33.

| #   | Pass (`server/db.ts`)                                                | What it writes on an EXISTING shared row                                                                                                                                                           | Kind (`STARTER_FIELDS`)                            | After this change                                                                |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| B1  | `dedupeBaselineRows` (materials, labor rates, modifiers, assemblies) | deletes an unreferenced duplicate shared row (keeps any something points at)                                                                                                                       | structural                                         | **keep**                                                                         |
| B2  | `renameBaselineMaterials`                                            | `name` from `RENAMED_BASELINE_MATERIALS`                                                                                                                                                           | **offer** (Q17)                                    | **propose** (§ 3.3 — and must not duplicate)                                     |
| B3  | `retireBaselineMaterials`                                            | `isActive = false`                                                                                                                                                                                 | hide (§ 3 "Hiding": existing companies keep it)    | **propose — held** (needs `hideStarterItem`)                                     |
| B4  | `reactivateBaselineMaterials`                                        | `isActive = true`                                                                                                                                                                                  | add (a choice comes back; no number)               | **keep**                                                                         |
| B5  | insert missing materials (by exact name)                             | — (insert)                                                                                                                                                                                         | add                                                | **keep**, with the rename/log check of § 3.3                                     |
| B6  | `backfillMaterialMetadata`                                           | `costPerUnit`, `laborHours`, `fieldBendLaborHours`, raceway facts, `stickJoint`, `defaultQty` + tags `isExamplePrice` / `isExampleLaborHours`                                                      | **offer** (F2)                                     | **propose**                                                                      |
|     |                                                                      | `category`, `searchAliases`, `description`, `isSpecialty`                                                                                                                                          | everyone                                           | **keep** (logged — § 3.2)                                                        |
|     |                                                                      | `trade`                                                                                                                                                                                            | not-editable (app-kept)                            | **keep**                                                                         |
| B7  | insert missing labor rates; `backfillLaborRateAmounts`               | `hourlyCost`, `annualSalary`, `annualHours`, wage/burden parts, `isExampleRate`                                                                                                                    | **offer** (F5)                                     | insert keep; re-stamp **propose**                                                |
| B8  | insert missing modifiers                                             | — (insert only; no re-stamp)                                                                                                                                                                       | add                                                | **keep**                                                                         |
| B9  | `seedBaselineAssemblies` role fill                                   | `laborRateId` where NULL                                                                                                                                                                           | **offer** (F6)                                     | **propose**                                                                      |
| B10 | whip pass                                                            | `assembly_materials.isBranchWhip` false → true                                                                                                                                                     | **offer** (part_field)                             | **propose**                                                                      |
| B11 | `projectType` re-stamp                                               | `projectType`                                                                                                                                                                                      | everyone                                           | **keep** (logged)                                                                |
| B12 | hours sheet (`STARTER_ASSEMBLY_HOURS`, empty today)                  | `baseLaborHours` + `isExampleHours`                                                                                                                                                                | **offer**                                          | **propose**                                                                      |
| B13 | `laborOnly` fill, `mountHeightTypeKey` fill (where NULL)             | those columns                                                                                                                                                                                      | **offer**                                          | **propose**                                                                      |
| B14 | insert missing assemblies (+ parts, modifiers)                       | — (insert)                                                                                                                                                                                         | add                                                | **keep**                                                                         |
| B15 | `seedBaselineKits`                                                   | insert only                                                                                                                                                                                        | add                                                | **keep**                                                                         |
| B16 | `seedBaselineRunTypes` insert; NULL-link repair                      | `raceway/conductor/groundMaterialId` where NULL                                                                                                                                                    | **offer** (F4)                                     | insert keep; repair **propose**                                                  |
| B17 | `seedBaselineRunTypeExtras`                                          | inserts an extra on an EXISTING type                                                                                                                                                               | **offer** (§ 3 "Exception": a run-type change)     | **propose — held** (extras not in C's build); keep for a type inserted this boot |
| B18 | `swapBaselineRunTypeMaterials`                                       | run-type material links (`RUN_TYPE_MATERIAL_SWAPS`)                                                                                                                                                | **offer**                                          | **propose**                                                                      |
| B19 | `retireBaselineRunTypes`                                             | `status = archived`                                                                                                                                                                                | hide                                               | **propose — held**                                                               |
| B20 | `seedStarterLaborSteps`                                              | steps' `name/unit/reasoning/minutes/isExampleMinutes/isActive`; starters' step lists (delete + insert); `STARTER_ASSEMBLY_OVERHEAD` (`overheadLaborHours`); `STARTER_HOURS_CLEARED` (hours → NULL) | offer (labor steps not in C's five tables yet; Q8) | insert keep; everything else **propose — held**                                  |

"propose" = the boot writes nothing and the change appears in the seed
proposal (§ 3.1). "held" = it appears there but cannot be applied yet,
because `applyStarterChange` has no door for it (C: hide, extras, kits, labor
steps are "NOT built yet"). It is never lost: the seed file still holds it.

**What is pending today:** `git diff 60479773 HEAD -- server/seed` is empty,
and so is local-dev against `origin/track-b` and `origin/track-c`. Live's
last boot stamped exactly this seed, so on a copy of live the proposal is
expected to be **empty** (§ 4.3 measures it). If it is not, stop and find out
why: either this line is stale or live is not in the state assumed.

---

## 2. The safest change — in one sentence

**On an existing shared row, the boot writes only what moves no number;
everything else becomes a proposal that a person confirms through
`applyStarterChange`. Inserting a missing shared row is unchanged, so a
brand-new database still gets the whole starter from the seed on its first
start.**

Not chosen, and why:

- **Plan § 6's gate "only on a database that has a `starter_changes` log".**
  Live's log is empty and stays empty until the first screen edit, so live
  would keep re-stamping (F2) until then — the owner's rule is broken on
  every deploy in between. Gate on nothing: one behaviour on every database.
- **Route the seed diff through `applyStarterChange` automatically at boot.**
  Then every deploy pins every company for every seed edit with nobody
  having looked. The owner's line is "a deploy never changes the starter by
  itself" (§ 6). Confirmation is the point.
- **Keep re-stamping on databases with no companies (test, staging).** Two
  paths, and staging would rehearse the one live does not take. Local and
  test databases follow a seed edit with one command (§ 3.4).

---

## 3. The change

### 3.1 One diff, three readers — `server/seedProposal.ts` (new, A)

`seedProposal(): Promise<SeedProposal>` reads the shared rows and the seed
modules and returns, per difference on an EXISTING shared row:

- `changes: StarterChangeInput[]` — exactly C's input type, so `--apply`
  hands it straight to `applyStarterChange` with no translation;
- `held: { table, rowKey, what, why }[]` — B3, B17, B19, B20: differences
  with no door yet;
- `liveAhead: …[]` — differences where the shared row holds a value that was
  LOGGED by the screen / sheet / copy (§ 3.3). Not a proposal: the seed is
  behind and C's "Export to seed" closes it.

Read-only. Three callers:

1. **The boot** — logs one line and writes nothing from it:
   `[seed] starter: inserted N, finding fields M, proposed P (not applied), held H, live ahead L`.
2. **`scripts/starterDrift.mts`** (named in plan § 6) — prints the proposal;
   `--apply --note "…"` calls `applyStarterChange({ source: "seed",
editorUserId: null, changes })` as ONE batch. Dry run by default, same
   shape as `freezeSentBids.mts`; `databaseGuard` for a remote database.
3. **Later, B's screen** ("Seed file proposes 37 changes: Review") reads the
   same function through a router. C's drift check (§ 11, C's list) reads it
   too rather than writing a second diff.

The diff is decided per field by `starterFieldKind` — **not a second list**.
A seed field `STARTER_FIELDS` does not classify is a test failure (§ 4.1 T8),
so a new seed column (PS step 6's `packQty`, § 6 below) cannot be stamped or
proposed until somebody decides what it is.

Example tags travel with their number: a proposed `costPerUnit` carries
`isExamplePrice`, `laborHours` carries `isExampleLaborHours`, a rate carries
`isExampleRate`, `baseLaborHours` carries `isExampleHours`. **Gap, for C:**
those tags are `not-editable` in `STARTER_FIELDS`, so `applyStarterChange`
cannot write them today. They need a "companion" rule (the tag is written in
the same change as its number, never on its own). Until that exists,
`--apply` refuses a proposal whose tag would differ, rather than splitting a
number from its tag.

### 3.2 What the boot still writes on an existing shared row

Only B1, B4, the `everyone` fields of B6/B11, and `trade`. Each through ONE
helper, `bootMayWrite(table, field)`, which answers from `starterFieldKind`
(`everyone`, plus the app-kept `trade`) — the passes stop listing columns.

The `everyone` writes go through `applyStarterChange` (source `seed`), not a
bare `UPDATE`, so the log is complete and undo works on them too (they pin
nobody; that is C's step 3). A boot with nothing to change writes no batch.
**Requires 0152 on the database**; a database without it (none today except
live at 152, which gets 0152–0156 first) skips the write and says so, the
same way `stepsTablesMissing` does.

### 3.3 The two traps a frozen boot opens, and the guards

**a. A pending rename would insert a duplicate.** B5 inserts any seed name
it does not find. If B2 no longer renames, the new name is "missing" and a
second row is inserted, stranding every recipe on the old one (CLAUDE.md §
"Renaming a shipped material is not a text edit"). Guard: a seed name counts
as PRESENT if its old spelling (any key of `RENAMED_BASELINE_MATERIALS` that
maps to it) exists as a shared row. And every by-name lookup the seed makes
(assembly parts via `starterPartName`, run-type links, swaps) resolves
through one function, `shippedRowByName`, that accepts the old spelling
while the rename is pending.

**b. A screen edit would be undone or duplicated by the next boot.** The
fault C named, in two shapes: a logged price written back (fixed by § 3.1),
and a logged NAME change — the seed still has the old name, does not find it,
and inserts it again. Guard: before treating a seed row as missing, or a
field as drifted, look up the latest `starter_changes` row for that
(table, row, field). If its source is not `seed` and the row still holds its
`newValue`, live is ahead: skip it and report it under `liveAhead`. The same
check is what tells the drift report which side is newer.

### 3.4 Local, test and staging databases

They follow a seed edit by running `scripts/starterDrift.mts --apply` (no
companies to pin on a test database, so it only logs). `scripts/seedBaseline.mts`
on an empty database is unchanged — inserts only. Any test that edits a seed
value and expects the next boot to stamp it (§ 4.2) is rewritten to call the
proposal and apply it, which is the new path.

### 3.5 Other writers to shared rows (not the boot — listed so nothing is missed)

`scripts/repairStarterCovers.mts`, `repairStarterFixtureLines.mts`,
`repairStarterRetired.mts` write shared recipes directly, bypassing the log.
They are release-day scripts already run on live. Proposal: each gets a guard
that refuses a database whose `starter_changes` has any non-seed row, until
it is rewritten to emit `StarterChangeInput` parts. Not needed for the
release unless one of them is to be run again.

---

## 4. How to prove it

### 4.1 Tests that FAIL on the old code (each guard removed, run, restored — "N of N red", as C did)

New file `server/bootLeavesStarterNumbers.test.ts`, on its own shared probe
rows (C's pattern in `starterChanges.test.ts`), passing a probe catalog to
the `…From` seed functions:

| #   | Test                                                                                                                                                                                                                                                                                                           | Red on old code because       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| T1  | **A logged change survives a boot.** `applyStarterChange` a probe price, then two full boots: shared row still holds it, log unchanged, an unpinned company created AFTER reads the new price.                                                                                                                 | B6 writes the seed price back |
| T2  | **A seed edit reaches no one on boot.** Probe seed price differs from the row; boot; row and every company read unchanged; `seedProposal().changes` holds exactly that one change.                                                                                                                             | B6 stamps it                  |
| T3  | Same as T2 for each other writer: labor rate (B7), role fill (B9), whip (B10), hours sheet (B12), laborOnly / mountsAt (B13), NULL link (B16), swap (B18), extra (B17), retire material / run type (B3, B19), labor-step minutes (B20).                                                                        | each pass writes              |
| T4  | **A logged rename is not re-inserted.** `applyStarterChange` a name; boot; no second row; `liveAhead` lists it.                                                                                                                                                                                                | B5 inserts the old name again |
| T5  | **Fingerprint catch-all.** Every `offer` field of every shared row in the five tables + `assembly_materials`, run-type extras, labor steps and step lists, fingerprinted before and after two full boots on a DB whose rows were moved off the seed: identical. Same shape as `bootLeavesCompanyRows.test.ts`. | old passes restore them       |

Guards for the NEW design's own traps (green on old code, red if the new code
gets them wrong — said plainly, they are not proof of the fix):

| #   | Test                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T6  | **Brand-new database gets the full starter**: probe catalog of names not in the DB → every seed field inserted (price, hours, raceway, tags, links, parts, extras, steps); `seedProposal()` on it afterwards is EMPTY. |
| T7  | **Finding fields still reach everyone**: probe seed aliases / shelf / `projectType` change → stamped on boot, one `seed` batch logged, no pins. A second boot writes no batch.                                         |
| T8  | **Every seed field is classified**: each key the seed types carry maps to a `STARTER_FIELDS` kind (or the app-kept list). Red the day a seed column is added unclassified.                                             |
| T9  | **A pending rename does not duplicate** (§ 3.3a): rename-map entry, old name present → boot inserts nothing; a starter and a run type naming the NEW name still resolve the row.                                       |
| T10 | `--apply` of a proposal = one batch; re-run proposes nothing; refusal of a tag split (§ 3.1) writes nothing.                                                                                                           |

### 4.2 Old tests that pin the old behaviour — rewritten, history kept in their text

At least: `seedPreservesUserPrices.test.ts` "re-stamps the shipped row
itself, which is the half that must keep working" (now: the boot does NOT,
the proposal does); `starterValues.test.ts`; labor-rate re-stamp tests in
`laborRates.test.ts`; the run-type swap / extras tests in
`sch80And500Seed`, `perFootSeed`, `catalogReviewSeed`;
`seedReactivatesRetired.test.ts` (reactivate stays, retire becomes a
proposal). **The full list is found by running the suite, not by this grep**
(28 test files call a seeder; the list above is what reading found). Every
change to an old assertion is named in the commit.

### 4.3 Numbers on real copies (old code vs new code, each in its own worktree)

1. **Fresh database, old vs new:** two empty DBs from migrations,
   `scripts/seedBaseline.mts` with old code in one and new in the other;
   fingerprint every shared row in every starter table (no ids, no
   timestamps): **identical**. This is the "a brand-new database still gets
   the full starter" proof.
2. **Copy of live** (from the latest verified backup), at 157:
   - `scripts/bidTotals.mts` before and after a new-code boot: all bids
     totalDue / not-priced / incomplete **unchanged**;
   - `scripts/companyRowsCheck.mts`: company rows unchanged;
   - new `scripts/starterRowsCheck.mts` (read-only shared-row fingerprint):
     unchanged;
   - `starterDrift.mts`: **proposed 0, held 0, live ahead 0** (§ 1).
     Honest limit, as in session 33: with zero drift the old code writes
     nothing either, so steps 2's numbers cannot tell old from new. Step 3 can.
3. **The fault, shown on the copy:** `applyStarterChange` one probe price on
   a shared row → old-code boot → the price is back to the seed's (the bug);
   restore the copy, same change → new-code boot → the price stays, and
   `starterDrift` reports `liveAhead 1`. Drop the copy after.
4. **Local `bidrender_local`** (4,386 bids): `bidTotals` unchanged across the
   new boot.

`pnpm check` clean; full suite on `bidrender_test_localdev`; Gate on the
branch.

---

## 5. What must happen in the next live release

No migration of its own: the boot writes nothing new, and its logged
finding-field writes use 0152, already in the release.

1. **0152–0156 on live BEFORE this code reaches `main`** (already required;
   expect 157, 196/196 — if not, stop and find out why).
2. **Before the push:** `bidTotals.mts` and `starterRowsCheck.mts` on live
   (read-only) — the "before" half.
3. **First boot:** read the `[seed] starter:` line in DigitalOcean's runtime
   log. As built it reads `[seed] starter: finding fields applied 0; proposed
0 (not applied), held 0, live ahead 0` (no "inserted" count — § 8). Expect
   all four **0**. Anything else: stop and find out why before going on.
4. **After:** `starterDrift.mts` on live (read-only) → 0; `bidTotals` and
   `starterRowsCheck` unchanged; `/api/version` commit.
5. **Rollback warning, written into the release record:** once ANY starter
   change has been logged on live, rolling back to a build without this
   change re-stamps the shared rows from the old seed on its first boot,
   undoing logged changes for every unpinned company. Before a rollback,
   run `starterDrift.mts`; after it, run it again.
6. **CLAUDE.md** § "Where a priced catalog lands" amended in the shipped
   commit (old text kept, override dated) — and `deploying.md` gains "a seed
   edit reaches live via `starterDrift.mts --apply` after the deploy, with
   the owner's confirmation", since a deploy no longer carries it.
7. **Not on release day:** applying any seed proposal on live. That is a
   separate, owner-confirmed step.

---

## 6. After it: PS-M1..M6 (`pricing-safety-plan.md` § 6)

All six are additive, step 1, step 3 empty; C's SQL word for word, one
column or table per file. They do not depend on the boot change, but **C's
PS step 6 does**: seeding `packQty` / `packLabel` from `packFor` onto shipped
rows was planned as a `backfillMaterialMetadata` re-stamp, which this change
removes. On an existing database, filling `packQty` becomes a seed proposal
(offer — it feeds price bands and the purchase list) and `packLabel` a
finding field (stamped). T8 is what forces that decision.

| Order | File (number at write time) | What                                                      | FK  |
| ----- | --------------------------- | --------------------------------------------------------- | --- |
| 1     | 0157 PS-M1                  | `materials.packQty decimal(10,4) NULL`                    | —   |
| 2     | 0158 PS-M2                  | `materials.packLabel varchar(32) NULL`                    | —   |
| 3     | 0159 PS-M3                  | `materials.packPrice decimal(12,4) NULL`                  | —   |
| 4     | 0160 PS-M4                  | `materials.priceCheckAcceptedAt decimal(10,4) NULL`       | —   |
| 5     | 0161 PS-M5                  | `price_imports` (+ index)                                 | 1   |
| 6     | 0162 PS-M6                  | `price_import_rows` (+ index) — after M5, its FK needs it | 2   |

Expect **163 applied, 199/199 FKs** after them. If either number does not
match, stop and find out why — either this line is stale or another batch
landed first.

With them, in the same commit: `schema.ts` declares all six;
`STARTER_FIELDS` classifies the four new `materials` columns (suggested:
`packQty` offer, `packLabel` everyone, `packPrice` and
`priceCheckAcceptedAt` not-editable — company values; C to confirm);
`LIBRARY_OWNERSHIP_FIELDS` question for `priceCheckAcceptedAt` (should a
fork copy a dismissal? suggested no); `forkableReferences.test.ts` gets
`price_import_rows.materialId` with resolver "the row itself" (C's note).

**Overall order:** boot change built + proven → PS-M1–M6 on local / test /
staging → C's PS steps 1, 5, 6 (2–4 wait on the Platt export) → both go live
in one release, migrations first.

---

## 7. Questions for the owner (one line each, suggested answer after the dash)

1. Should the remaining pricing-sheet seed edits (Switches, Receptacles, Boxes answers) reach live through the OLD automatic re-stamp before this goes live? — Yes: live holds only your own and test companies, and after this change they would be pinned at the old values with no Accept button until B builds offers.
2. Same behaviour on every database (local, test, staging, live), no automatic re-stamp anywhere? — Yes: one path, so staging rehearses what live does.
3. Should the boot log search-word / shelf changes it still applies by itself? — Yes: one `seed` batch when something changed, none when nothing did, so undo and "what changed" cover them.
4. Before rolling back past this change, check drift first (§ 5.5)? — Yes, written into `deploying.md`.

### Owner's answers — 2026-10-13: all four YES, as suggested

1. **Q1 YES.** The remaining pricing-sheet seed edits reach live through the
   OLD automatic re-stamp BEFORE this change goes live. **This change ships
   in the release AFTER the end-of-pricing load** — so it must not reach
   `main` in the same push as those seed edits. § 5 applies to that later
   release.
2. **Q2 YES.** One behaviour on every database; no automatic re-stamp
   anywhere.
3. **Q3 YES.** Finding-field writes the boot still makes are logged as one
   `seed` batch (none when nothing changed).
4. **Q4 YES.** Drift is checked before and after any rollback past this
   change (`deploying.md`).

---

## 8. BUILT on local-dev — 2026-10-13 (session 40, Track A)

**Not pushed** (waits for B's merge, owner). **Reaches live one release AFTER
the end-of-pricing load** (Q1) — it must not ride the same push as those seed
edits.

### What changed

- `server/db.ts`: the start passes now only INSERT. Removed on existing shared
  rows: `renameBaselineMaterials`, `retireBaselineMaterials`, the
  `backfillMaterialMetadata` re-stamp (now `stampMaterialTrade`, `trade`
  only), `backfillLaborRateAmounts`, the assembly role / whip / project-type /
  hours / laborOnly / Mounts-at passes, the run-type NULL-link repair,
  `swapBaselineRunTypeMaterials`, `retireBaselineRunTypes`, extras on an
  existing type, and every labor-step write except inserting a missing
  library step. Kept: dedupe, reactivate, all inserts. New:
  `namesTheStarterAlreadyHas` (§ 3.3a pending rename + § 3.3b logged rename
  count as present), `latestLoggedChanges`, `shippedMaterialIdsByName` (the
  seed's new name resolves to the old row while a rename is pending), and a
  new starter's step list / overhead / cleared hours written AT INSERT.
- `server/seedShippedLibrary.ts`: the step library now seeds with the first
  group (before assemblies); at the end, one `seedProposal()`, the finding
  fields applied as ONE logged `seed` batch under a seed lock (Q3), and the
  one log line.
- `server/seedProposal.ts` (new): the diff, per field by `starterFieldKind`.
  `findingFields` / `changes` / `held` / `liveAhead`. Held, besides the no-door
  cases: a number whose Example tag would change with it (C cannot write the
  tag yet), a unit change, and a seed 0 on an above-zero field.
- `scripts/starterDrift.mts` (new): read; `--apply --note` = one batch.
- Docs: CLAUDE.md § "Where a priced catalog lands" and the rename/retire
  paragraph (dated overrides, old text kept); `deploying.md` § 4a + § 5b
  (the confirmed step; rollback drift check, Q4); `baseline-screen-plan.md`
  § 6; `starterChanges.ts` header (its "do not call before the boot change"
  warning is now history).

**Differs from §§ 3–5 above, said here:** the log line has no "inserted"
count (each seeder inserts in its own lock; counting would need a return
value from all six) — § 5 step 3 now quotes the real line. `starterRowsCheck.mts`
was not written: the shared-row comparison was done by a whole-table compare
(below) — write it before the release rehearsal if wanted. The repair
scripts in § 3.5 are untouched (not needed unless run again).

### Proof

- **Tests red on the old code** — `server/bootLeavesStarterNumbers.test.ts`
  run in a worktree of `c7865547` (old start passes, new read-only helpers
  appended): **T1, T2, the seven T3 writers, T4, T5 — 11 of 11 red**, each on
  its "a start wrote it" assertion (e.g. T1 "a start wrote the seed price
  back: expected 2 to be 4.25"; T4 "the old name came back"). T7 and T10 also
  red there (no logged batch / nothing to propose). All 17 green on the new
  code.
- **Old tests that pinned the re-stamp, rewritten with their history in the
  text (12 tests in 9 files):** `seedPreservesUserPrices` (1),
  `catalogReviewSeed` (3), `sch80And500Seed` (1 — now also the § 3.3a "no
  second row" check, T9), `seedNameCase` (1), `seedReactivatesRetired` (2),
  `materialsLibrary` (2), `deviceMountKind` (1), `exampleTagsFlow` (1),
  `laborOnly` (1). Plus one LEAK: `laborRateSharing` wrote $38 / $22 onto the
  shipped Journeyman / Apprentice rows and said "safe to leave behind: every
  suite that seeds labor rates re-stamps them" — now false, and it turned
  four `onboarding` and two more `exampleTagsFlow` tests red later in the same
  run. It puts the rates back after the file now. Every test that moves a
  shared row puts it back itself, because no start will. The first full run
  on the new code was 11 failed / 6,973 passed / 6 skipped, 420 files (all
  these). After the fixes the 7 affected files ran 115/115 green with drift 0. **A second FULL run was stopped by Claude Code at 48 of 420 files for
  low machine memory** (0 failures to that point; not restarted without the
  owner asking, since memory may still be short) — so the full suite after the
  fixes is NOT measured here. The Gate run after the push is that check.
- **Fresh database, old vs new:** two empty DBs migrated to 157,
  `seedBaseline.mts` with old code in one and new in the other — **all 12
  starter tables IDENTICAL** (1,717 materials, 6 rates, 5 modifiers, 224
  assemblies, 24 run types, 47 steps, 3 kits, 1,184 recipe lines, 1 modifier
  link, 10 kit links, 18 extras, 194 step-list lines). New code's line: 0 / 0
  / 0 / 0.
- **Totals on a copy** (`bidrender_scratch_boot_copy`, copy of
  `bidrender_local`, 84/84 tables): `bidTotals` with the OLD code, then two
  new-code starts (0 / 0 / 0 / 0 each), then `bidTotals` with the new code:
  **all 4,386 bids: totalDue, not-priced and incomplete unchanged.** Every
  library table, shared AND company rows (11,577 materials, 3,027
  assemblies, …), identical to the untouched source.
- **The fault, shown on that copy (§ 4.3 step 3):** a logged change "#14 THHN
  solid Copper" $0 → $1.11 (67 pins). Two new-code starts: still $1.11,
  "live ahead 1". One old-code start: back to $0.0000, no log.
- `starterDrift.mts`: `bidrender_local` 0 / 0 / 0 / 0; `bidrender_test_localdev`
  0 / 0 / 0 / 0 after every run (two drifted rows and the old-code run's
  duplicates repaired by hand on that test DB, ids kept).

### Scratch left for the owner to drop

DBs `bidrender_scratch_fresh_old`, `bidrender_scratch_fresh_new`,
`bidrender_scratch_boot_copy`. Worktree removed.
