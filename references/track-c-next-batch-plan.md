# Track C — next batch (plan only, 2026-09-29)

**Status: PLAN. Nothing below is built.** Written on `track-c` at `8c5c478`.
No migrations in this batch: the one item that needs a schema change is
listed as a handoff for Track A (§ 4) and waits on it.

Order, as asked: wrong numbers first (§ 1), then how search reads numbers
(§ 2), then tests that leave rows behind (§ 3).

Every open entry in `todo.md` was read for this (98 unticked). The ones that
state a wrong number, or name the wrong part beside one, and sit in Track C's
area (takeoff counts, the catalog, the deploy tooling) are in § 1. The ones
left out, and why, are at the end of § 1.

---

## 1. Wrong numbers

### W1. The sentence under a sweep row still says "90° elbows"

**What is wrong.** A run type set to buy sweeps sends
`2" PVC Sch 40 90-degree sweep, 36" radius`, and the caption under that row
reads "At least 2 90° elbows: 2 corners …". The count is right; the part it
names is not. CLAUDE.md rule 7: a caption naming the old thing beside a number
carrying the new one reads as confirmation.

**Where.** `FITTING_KIND_LABELS` (`shared/runFittings.ts:166`,
`elbow90: "90° elbow"`), the counted sentence in `shared/runBends.ts:713`, and
the panel's heading table (`RunsPanel.tsx:537`, same table).

**Plan.** The kind stays `elbow90`; the WORD comes from what the run type
buys. Sweep type → "90° sweep(s)"; factory elbow → "90° elbow(s)"; field bend
already says "field bend". Same for 45s. One function
(`bendWordFor(kind, runType)`) that both the server sentence and the panel read,
so they cannot disagree (CLAUDE.md § "Copying a layout does not copy the
behaviour").

**Test that fails without it.** `runBends.test.ts`: a sweep run type's sentence
contains "sweep" and not "elbow"; an elbow type's is unchanged.
**Screen check:** the run panel on a sweep type, then on an elbow type.

**Question Q1** (wording is the owner's call, todo says so): name the part the
run type buys (recommended), or say "bend" on every raceway?

### W2. `schemaDrift.mts` says "never been migrated" when it cannot connect

**What is wrong.** `server/schemaCheck.ts` ~489–495 reads the migration count
inside `try { … } catch { }` and treats EVERY error as "the table is absent".
A timeout, a refused connection or a bad password all print "No
\_\_drizzle_migrations table — this database has never been migrated." Measured
2026-09-27 against production (89 applied) from off the trusted list. A false
"never migrated" invites re-running every migration against live data.

**Plan.** Catch only MySQL's `ER_NO_SUCH_TABLE` (1146) as "never migrated";
anything else is thrown and printed as "could not read the database: <reason>"
with a non-zero exit. The check stays read-only.

**Test that fails without it.** `schemaCheck` unit test with a fake db whose
query rejects `ETIMEDOUT` → must reject, not return 0; one rejecting 1146 →
returns "never migrated". Then remove the warning in `references/deploying.md`
§ 10 that exists only because of this.

### W3. `schemaDrift.mts` says a missing key's migration "is already recorded as applied" when it is not

**What is wrong.** Measured 2026-09-29 on `bidrender_test_c` at 89 of 96: it
listed two missing foreign keys and said the migrations declaring them were
applied, then printed hand-written `ALTER TABLE … ADD CONSTRAINT` lines. Both
keys came from 0089 and 0095, which were pending. The sentence is a fixed
string (`server/schemaCheck.ts` ~712). Harm: someone adds a key by hand, then
the real migration dies on a duplicate constraint.

**Plan.** For each missing key, find the migration file that declares it
(search `drizzle/*.sql` for the constraint name) and compare with the journal
rows the database holds. Pending → "0095 adds it — run migrate.mts". Applied →
today's text and the ALTER. Not found in any file → say that.

**Test that fails without it.** A fixture journal and two fixture migrations:
a key from a pending one must not print "already recorded as applied".

### W4. A cable run's tee buys no box

**What is wrong.** A branch on a cable run (MC, NM) counts footage and drops
but no junction box at the split — a quantity silently short, one box per tee.
`teeBoxOwners` (`shared/runNetwork.ts:299`) ranks by raceway size; a cable type
has none, and cable types get no fitting lines at all.

**Plan.** No schema change: the `teeBox` / cover roles already exist on
`bid_line_items.runMaterialRole` (0085). A cable type's tee buys a box by a
fixed rule instead of by raceway size. A conduit leg at the same tee still
owns it (largest raceway), so nothing moves on conduit-only bids.

**Test that fails without it.** An MC run with one tee sends 1 box + 1 cover;
a mixed EMT/MC tee buys one box, owned by the EMT type.

**Question Q2:** which box does a cable tee buy? Recommend
`4" square box, 2-1/8" deep` plus `4" square blank cover` (what an MC or NM
splice goes in), the same pair for every cable type.

### W5. Locknuts and bushings are never counted — HANDOFF TO A first

**What is wrong.** A rigid or IMC run, or EMT into a panel, buys a locknut
per connector and a bushing on the larger sizes. The rows exist
(`<size> conduit locknut`, `<size> conduit bushing`); nothing counts them, so
every such bid is short by those parts with nothing on screen saying so.

**Why it waits.** A line is keyed by run type + `runMaterialRole`, and there
is no `locknut` or `bushing` role. Appending them is a migration → § 4.

**Plan after A's migration.** Count one locknut per connector end
(`countFittings` already knows the ends), bushings per Q3, send as two more
fitting lines with sentences like the others.

**Question Q3:** bushings on which runs? Recommend every rigid/IMC end, and
EMT/other ends from 1-1/4" up (where a #4 or larger conductor usually is,
NEC 300.4(G)). Locknuts: one per connector end on every conduit family that
uses a threaded connector into a knockout.

### Left out of this batch, and why

| Item                                                            | Why not now                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| "Nobody has priced this" needs its own signal                   | Blocks the priced-catalog upload, not beta. Likely needs a column: Track A's, when the upload is scheduled. |
| Dashboard newest-plan date 7 h early locally                    | Track B's screen; production is unaffected (UTC session). Needs one connection-wide rule, its own look.     |
| Double counting from a user's own assembly (elbows, connectors) | No guard, by the owner's decision 2026-09-26.                                                               |
| Lines sent before `1956a90` read "0 h"                          | Cannot be told apart from a set zero; production had no bid lines then.                                     |
| Flex straps say "No catalog strap"                              | Honest, not wrong — the screen says the part is missing. Needs sized flex strap rows; a catalog item later. |
| Re-apply on a pre-markup line reads today's links               | Track B's markup work.                                                                                      |

---

## 2. How search reads a number

### S1. A COUNT number matches inside and at the start of SIZES — root cause of three wrong results

**Found while planning this, and one of the three is mine:**

| Query        | Top of the list today                                               | Should lead with                                 |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------ |
| "2 gang box" | FS cast 2-gang, Handy box, **`1/2" weatherproof box, single-gang`** | Double-gang box                                  |
| "3 hole"     | `3/4" EMT one-hole strap`, `3" EMT one-hole strap`, …               | the weatherproof boxes ("3 hole" is their alias) |
| "2 pole 20"  | `20 ft light pole`                                                  | 20A 2-Pole breaker                               |

**"2 gang box" is a regression from `8c5c478`** (the weatherproof boxes).
Measured in a clean worktree at `e70ec15`: `Double-gang box` was 4th; after
the rename, `1/2" weatherproof box, single-gang` took a top-five place and
pushed it out. The standard spot-check sweep did not contain this query, so it
passed.

**Cause, read from the code.** `smartSearch.ts` already knows "3 hole" is a
count: `expandTokens` sees the count noun after the number and matches the
number AS A WORD (`asWord`, ~line 817). But a word match is fuzzy by design —
it accepts a word that STARTS with the term and, at a lower tier, one that
CONTAINS it. So the count "3" matches the size `3/4"` and `3"`, and the count
"2" matches inside `1/2"`. Strict size matching (added 2026-09-25, "never fuzz
numbers") was written for SIZE terms; count terms went back to the old fuzzy
path on purpose, to find "Double-gang box" for "2 gang box", and took the fuzz
with them.

**Plan.** A count number matches only:

1. a whole word equal to it ("2"),
2. the number of a count token in the item ("2-gang", "3-way", "2-Pole"),
3. its spelled-out forms through the alias map (double, two, single, one) —
   as today,

and never the start or inside of a word that is a SIZE (carries an inch mark,
a fraction, `#`, an amp or `ft` marker — the same test `sizeKey` uses).

**Risk to other searches, stated before touching it.** This changes every
query that has a number followed by a count word, and those are some of the
commonest searches in the app. What could move:

- Queries that today reach the right row ONLY through the fuzz. Candidates:
  "1 hole strap" (straps are named "one-hole"; "1" today also prefix-matches
  `1"` and `1-1/4"`), "1 pole" ("Single-Pole"), "2 light", "20 space",
  "2 circuit". If the alias map does not cover them, they would LOSE results.
- The order within results where the fuzz currently ranks a right row higher
  than its alias would.
- Nothing about SIZE terms moves: the change is inside the `asWord` path only.

**How the risk is bounded:**

- Before touching the code, add a COUNT sweep to `scripts/searchSpotCheck.mts`:
  every count noun (gang, pole, way, hole, head, light, space, circuit) with
  the numbers people type (1–6, 20, 30, 40, 42), bare and with a following
  word ("2 gang box", "3 way switch", "2 pole 20"). Record it on the current
  code. That is the before.
- After: the standard sweep must not move at all; the count sweep may move
  only where the before was wrong, and every moved query is listed in the
  commit with before and after.
- Pin the three rows above plus "1 hole strap", "3 way", "4 gang", "2 pole"
  in `materialSearchRank.test.ts`. They go red on today's code (the first
  three) or stay green (the rest) — both halves are the point.

**Question Q4:** accept the rule above, including that a count never matches
a size? Recommend yes. If you would rather not touch search now, the
catalog-only stopgap for "2 gang box" is to mark `Double-gang box` "common"
(`shared/materialCommonness.ts`); it does not fix "3 hole" or "2 pole 20".

### S2. `5/6" wafer LED downlight` (the old spelling) finds nothing

Same area, lower risk, already in todo. The rename map knows the old name
(`shared/renamedMaterials.ts:39`), and ranking treats a former name as exact
(`phraseTier`), but the MATCHER runs first and requires every term to match:
`5/6"` is read as a size in inches, no row has that size, so nothing reaches
the ranker. **Plan:** check `renamedTo(query)` before term matching and, on a
hit, return the renamed row first. **Test:** the old spelling returns the
renamed row first; loop the whole rename map (the existing loop in
`materialSearchRank.test.ts` does this for ranking, not for matching).

---

## 3. Tests that leave rows behind

### What happened (2026-09-29)

The first full run on `bidrender_test_c` failed partway through
`server/takeoffBridgeFlow.test.ts` (missing columns). That file inserts
**shared** assemblies (`userId NULL` — every company sees them) and deletes
them at the END of the test body, so a failure left one behind:
`Fork flow starter R3 <time>`. The next run's `assemblies.test.ts` — which
runs before it, alphabetically — found a shipped assembly with no materials
and failed. `takeoffBridgeFlow`'s `beforeEach` deletes leftovers by name, but
only when that file starts, after the damage.

### Measured after a CLEAN full run (4,056 passed), `bidrender_test_c`

- **Shared rows: none leaked.** 1,520 materials = the catalog; 8 assemblies,
  3 kits, 5 labor rates, 5 modifiers = the seeders' lists.
- **User-owned rows: a lot.** 121 users, 4,242 bids (40 owners), 480 owned
  materials, 219 owned assemblies, 111 company memberships, and smaller
  counts in 20 other tables. None crosses files today — fixture ids are
  distinct — but every one is a row a test left for somebody else.

Only two test files write `userId: null` literally (`takeoffBridgeFlow`,
`materialsLibrary` — the second is a pure-function fixture, no database). A
grep is not enough, though: an insert that omits `userId` also writes NULL.

### T1. Fix the file that did it

`takeoffBridgeFlow.test.ts`: register the delete with `onTestFinished` right
after each shared insert (runs on failure too), and keep the by-name clean in
`beforeEach` as the second net. **Test that fails without it:** make the test
throw after the insert on purpose (locally, not committed) and read the table
— the row must be gone. Recorded in the commit, as the backup race was.

### T2. A guard that fails the file that leaks — the forcing function

In `vitest.setup.ts` (runs inside every file): `beforeAll` records the ids of
shared rows in the library tables (`materials`, `assemblies`, `kits`,
`labor_rates`, `modifiers`, `takeoff_run_types`); `afterAll` fails the FILE if
any shared row exists that was not there before AND whose name is not in the
shipped seed lists (seeders legitimately add shipped rows on a fresh
database). The failure names table, id and name. The comparison is a pure
function in `scripts/` so vitest can reach it.

- **To confirm first, not assumed:** that a setup-file `afterAll` runs AFTER
  the file's own `afterAll` (vitest's hook order), or the guard would fire on
  rows a file is about to clean. `seedReactivatesRetired` is the test case:
  its shipped fixture row is removed in its own `afterAll`.
- **Test that fails without it:** the pure function flags a new shared row
  not in the shipped lists, ignores a shipped one and a pre-existing one.

### T3. User-owned leftovers — measure per file, then decide

Same guard, second half, in REPORT mode first: every `users` row created
during a file must be gone by its `afterAll` (a user delete cascades to
everything scoped to it). Run the suite once, list the files that leave users,
fix them file by file, then switch the guard from report to fail.

**Question Q5:** this batch does shared rows (T1, T2) and only MEASURES
user-owned ones (T3 report mode), or does it also fix every file? Recommend
the first: T3's fix touches roughly 40 files, and reads better as its own
change once the list is known.

---

## 4. Handoffs for Track A (schema)

| #   | Migration                                                                                   | Kind                                                                   | Unblocks |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| A1  | Append `locknut`, `bushing` to `bid_line_items.runMaterialRole` (like 0084/0085, no UPDATE) | ADDITIVE — apply BEFORE the code (CLAUDE.md § "Deploying a migration") | W5       |

Already waiting on A from earlier work, unchanged: `teeBody` on the same enum
(`todo.md`, "T bodies at a tee").

Nothing else in this batch needs a schema change: W1–W4, S1, S2 and T1–T3 are
code and tests only.

---

## 5. Questions for the owner (recommended answer first)

- **Q1.** Sweep caption: name the part the run type buys ("90° sweep" /
  "90° elbow"), or "bend" everywhere? _Recommend the part._
- **Q2.** A cable tee's box: `4" square box, 2-1/8" deep` + blank cover for
  every cable type? _Recommend yes._
- **Q3.** Bushings: every rigid/IMC end, and other families from 1-1/4" up?
  Locknuts: one per threaded connector end? _Recommend yes to both._ (Built
  after A1.)
- **Q4.** Search: a count number never matches a size (fixes "3 hole",
  "2 gang box", "2 pole 20")? _Recommend yes_, with the before/after count
  sweep as the gate.
- **Q5.** Tests: shared-row guard now, user-owned leftovers measured only?
  _Recommend yes._

## 6. Order of work once answered

1. S1 before anything else — it is a regression this track shipped.
2. W2, W3 (tooling that runs against production).
3. W1, W4.
4. T1, T2, then T3 in report mode.
5. S2.
6. W5 after A1 lands.

Each: `pnpm check`, the suite on `bidrender_test_c`, commit and push to
`track-c`. No merge until told.
