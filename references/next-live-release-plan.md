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

| What      | State (2026-10-08)                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Live      | `24105ad` (`origin/main`), database 0000–0104 (105 migrations)                                                           |
| Staging   | follows `local-dev`; database 0000–0134 (135), all applied before their code (`deploying.md` § 11)                       |
| Gap       | `git rev-list --count origin/main..origin/local-dev` = 178 commits before this file (merges and docs included)           |
| Candidate | not chosen. Must be a commit with a green Gate (test, deploy-staging, smoke) — `live-release-plan.md` § 0 if not the tip |

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

## 3. Migrations a live release would run: 0105–0134 (30 files)

All thirty are **step 1, additive** — no `UPDATE` to an older column — per
`migrations-next-batch.md` and the two staging records in `deploying.md`
§ 11. So all thirty go on BEFORE the push, in one run, in order.

| Files     | What                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0105–0106 | `assemblies.laborOnly`, `bid_line_items.snapshotLaborOnly`                                                                      |
| 0107–0116 | invites, AI correction log, sheet hash/height, assembly + group columns, label words, quotes, `lineRole`, markup                |
| 0117–0124 | catalog shelves (0117), locknut/bushing, `parentId` + FK, brand, assembly shelves (0122), nullable hours (0123), legend entries |
| 0125–0131 | Track C: `bid_panels`, `bid_panel_circuits`, homerun settings, run-circuit panel, height areas, bends + `runsAt`                |
| 0132–0134 | example price / hours / labor-rate flags and wage parts                                                                         |

- **Expect: "Applied 30 migrations", then 135; a second run applies nothing;
  `schemaDrift` "matches"; foreign keys 173/173** (staging's number). If any
  differs, stop.
- **0115 swaps a unique key** on `bid_line_items` (`bid_group_uq` →
  `bid_group_role_uq`). Rehearsed; the one file worth reading twice.
- **Order is a hard rule:** the migrator skips a file whose `when` is older
  than the newest applied. Never apply 0132–0134 without 0125–0131 first, and
  never a subset of the thirty.
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

## 5. Check first — before the window

1. **Owner's yes** to release, and to which candidate commit.
2. **Green Gate on that exact commit** (test, deploy-staging, smoke). Smoke
   step 10 (undo a mark) flaked once on 2026-10-08 and passed on re-run
   (`todo.md` top) — a red step 10 is re-run once, a second red stops it.
3. **The white box on plan open** (`todo.md` "FIRST: the white box…") is
   reproduced on staging and **not fixed**. Owner decides: fix first, or ship
   with it (it is not a wrong number, but pins can draw over the blank and
   taps land on it).
4. **Read-only recount on live**: lines with `assemblyId IS NOT NULL AND
snapshotUnpricedParts IS NULL AND archivedAt IS NULL` — must be **0**
   (it was 0 on 2026-10-07). Otherwise freeze first (`todo.md`
   "WRONG-NUMBER RISK: older bid lines read their assembly's recipe LIVE").
5. **Backup of live**, restored locally, table counts equal; rehearse the
   thirty on that copy (apply, re-run, drift, `bidTotals` before/after with
   the candidate's code booted, the starter count with zero holds).
6. `git status --porcelain` empty, `pnpm check` clean, read
   `git log main..<candidate> --oneline` in full.
7. After the push: `curl -s https://bidridge.com/api/version` — `commit` and
   `builtAt`, not the version tag.

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

- Live `24105ad` / 0104; staging = `local-dev` / 0134; 178 commits apart.
- A release runs 0105–0134 (30, all additive) before the push, in one
  ordered run; expect 135, matches, 173/173 FKs.
- Pairing rules 1–5 all met on `local-dev`; rule 2 now expects ZERO holds
  (DV34 loads).
- Check first: owner's yes, green Gate on the candidate, the unfixed white
  box, live recipe-live recount = 0, backup + rehearsal with `bidTotals`.
- Wait: LT1/LT2 repair, any shipped prices/hours, brand prices, step 3,
  C's per-foot extras plan.
