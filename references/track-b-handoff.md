# Track B handoff — 2026-10-05

State at handoff: `track-b` = `origin/track-b` = `origin/local-dev` at
**`d9d805d`**, working tree clean. Nothing on `main`, no deploy. Track B's own
databases (`bidrender_local_b_new`, `bidrender_test_b`) are migrated to 105
and `scripts/schemaDrift.mts` says both match. Last gate: `pnpm check` clean,
292 test files / 4,976 passing / 5 skipped.

## WHERE B STANDS — 2026-10-07 (read this first)

- **`track-b` holds everything B has built and is WAITING on Track A.** It
  carries `a-batch-0105` (A's migrations 0105–0124) because Labor only was
  built on those columns. **0105–0124 are NOT on `origin/local-dev`**
  (checked 2026-10-07 after a fresh fetch: local-dev's newest migration is
  0104, head `3a173a0`; `caf6c60` is not in it). So:
  - **Do not push `track-b` into `local-dev`** until A's batch is there —
    it would bring A's migrations in through B.
  - `drizzle-guard` fails on `track-b` for the same reason, and only that
    reason (it lists A's `caf6c60`); it clears once A's batch is on
    local-dev. The `test` job passes.
  - When A lands it: pull local-dev into track-b, push, confirm Gate
    (drizzle-guard included), then merge into local-dev and confirm the
    staging deploy and smoke.
- **Then, on staging, the on-screen check still owed** (todo.md "ON-SCREEN
  CHECK of every hours not set screen"): bid line, totals, dashboard, quote
  panel, editor (empty box, "Use suggested"), Quick bid, kits, import — and
  the Labor-only tick — at laptop and tablet, on a throwaway bid deleted
  after. Labor only was checked LOCALLY on 0124 already (todo.md).
- **Ships together, never apart**: H2 step 2 with 0122/0123; Labor only
  with 0105–0106 and `5c98bd1` (migrations-next-batch.md says both).
- **Not run anywhere, on purpose**: the LT1/LT2 fixture repair script. It
  rides the next release (migrations-next-batch.md § "Data repairs").
- **Next B jobs with no A column and no bid number** (all on-screen): the
  pin look editor from the Legend tab and assembly editor, the ring around
  the symbol, faint marks.

## Session 2026-10-06 (late) — Labor only, on A's 0105–0106

- **Built on `track-b`, which now CONTAINS `a-batch-0105` (0105–0124).**
  So `track-b` must NOT merge into local-dev until A's batch is on
  local-dev: merging it first would carry A's migrations in by the back
  door. Once A lands the batch, pull local-dev and merge as usual.
- Track B's own DBs (`bidrender_test_b`, `bidrender_local_b_new`) are
  migrated to 0124. On that schema the starter holds lifted: only DV34 is
  held, the other 167 seed with hours not set.
- todo.md "LABOR ONLY — BUILT" has the parts, the tests and the screen
  check; the pairing rule is there and in migrations-next-batch.md.

## Session 2026-10-06 (night) — new assemblies start "not set"; CSV Pin column

- `304260a` on local-dev: green (tests, staging deploy, smoke).
- **A NEW assembly's hours start empty** (owner); grey suggestion + "Use
  suggested" (`client/src/lib/assemblyHoursSuggestion.ts`). Create now
  closes only on success, so a refused blank no longer loses the recipe.
- **The takeoff CSV's "Pin" column** (pin plan decision 11) — built; see
  todo.md's pin-looks entry. Picked as the next job because it needs no A
  column, moves no bid number, and is testable without a screen.
- **Next B jobs left with no A column and no bid number** (all display, all
  need a screen check, so start them when the laptop has memory for a dev
  server and browser): the pin look editor from the Legend tab and the
  assembly editor (pin plan § 6); the ring around the symbol at reading zoom
  (§ 4, needs step 0's measurement first); faint marks (decision 12). Plus
  todo.md's "hours not set" on-screen check, once A's 0123 is on local-dev.

## Session 2026-10-06 (evening) — H2 step 2, LT1/LT2 repair

- **H2 step 2 is built**: NULL assembly hours read as "not set" everywhere
  (`shared/assemblyHours.ts`; todo.md has the list). **It ships in the SAME
  release as Track A's 0122/0123, never apart** — written in todo.md and
  beside 0122/0123 in `references/migrations-next-batch.md`.
- **LT1/LT2 fixture repair**: `scripts/repairStarterFixtureLines.mts`,
  tested on `bidrender_test_b` and a dropped copy of the local database.
  NOT run on staging or live; listed in migrations-next-batch.md § "Data
  repairs" to ride the release.
- Open for the owner: should a user's own NEW assembly still pre-fill hours
  from `laborHourDefaults` or start "not set"?

## Session 2026-10-06 (later) — starter assemblies, labor sheet tab 2, run bends

- **All 168 starters are in the seed**, 160 HELD until Track A's 0123
  (hours NULL) and 0122 (two categories); DV34 until surface raceway. The
  holds lift by themselves from `drizzle/schema.ts`. todo.md, "Starter
  assemblies", has the files, the order rule, and the one owner question
  (LT1/LT2's new fixture line on existing databases).
- `pricing/labor-units-starter.xlsx` tab 2 = all 168, most-used first.
- `references/run-bends-plan.md` § 7: all three owner answers recorded;
  build after A's three columns.

## Standing rules (owner, 2026-10-05) — read before doing anything

**1. Merging: CI is the gate, not the laptop.** Do not run the full suite
locally before a merge. Instead:

1. `pnpm check` and the tests the change touches, locally.
2. Push `track-b`, then wait for the GitHub Actions **Gate** workflow's
   `test` job on `track-b` to go green (`gh run list --branch track-b`,
   `gh run watch <id>`).
3. Green: pull `local-dev`, merge `track-b`, push `local-dev`, and confirm
   the Gate run on `local-dev` is green too. That run also deploys staging,
   code only, and smoke-tests it.
4. Red, at either step: fix, push, repeat.

Run the full suite locally only when CI cannot tell you something. Why: the
laptop runs three tracks at once, and two full local runs on 2026-10-05
were stopped by Claude Code for low memory.

**2. Stopping a dev server: stop the whole SET, not the process on the
port.** `pnpm dev` starts a chain: pnpm → cross-env → `tsx watch` → the
server. Killing only the process holding the port (what was done on
2026-10-05) left three idle `tsx watch` chains in `C:\dev\BidPhase-B`. An
idle watcher can restart a server when files change, so it is a dev
server nobody knows is running. Stop it from the top: find the `pnpm …
dev` root for this folder and `taskkill /T /F /PID <root>`, then check
that no `node.exe` whose command line mentions `BidPhase-B` is left. Never
touch a set whose command line names another track's folder.

## Done

### Pin looks — chosen shape, letter, color (pin plan § 6, § 11.4)

- Columns 0099–0101 (A, batch 1). Resolver in `shared/pinLetters.ts`:
  count → legend symbol → assembly → automatic. Count/symbol letters are
  never renumbered (a clash is flagged in `clashesWith`); an assembly letter
  or color is a default and bumps. A value the palette no longer holds reads
  as automatic.
- **Shape can be chosen** — this overrides § 11.4's "shape is always the
  family's", on the owner's request; recorded in the plan and in
  `pinLetters.ts`.
- Where a count takes its look from: `client/src/lib/pinCounts.ts` (reads
  the company's FORK of a shipped assembly; finds a renamed symbol by its
  captured key).
- Saving: `takeoffGroups.setLook` (`where: "job" | "everyJob"`). Every job =
  the legend symbol, else the assembly (forked if shipped), and the count's
  own choice is cleared. A typed-name count is refused with the reason.
- Editor: `client/src/components/takeoff/PinLookEditor.tsx`, opened from the
  count card's swatch. Opens left with a capped height (it was cut off on a
  tablet).

### Mark status (pin plan § 7)

- Columns 0098 + 0103 (`unconfirmed`, A). Set with "Mark as…" on a
  selection (`takeoffStamps.setStatus`, refused on a locked bid, scoped to the
  bid) or by `drop`'s `status`. People choose only `USER_MARK_STATUSES`;
  `unconfirmed` is the reader's.
- Drawn: new filled · existing hollow + SOLID outline · remove red X ·
  relocate filled arrowhead badge · unconfirmed dashed hollow
  (`statusLook`, `shared/takeoffMarks.ts`). Card says the split in words and
  what is off the bid (`statusSplitText`, `unpricedStatusNote`).
- Refresh: `markStatus` and `pinLook` in `client/src/lib/takeoffRefresh.ts`
  (checked on screen: the card number moves without a reload).

### One "only NEW marks are priced" rule — merged with Track A's

A and B built the same rule the same day; the merge kept ONE of each:
`markCountsAsQuantity` (`shared/markStatus.ts`, A's; `isPricedMark` is the
same rule for a row) and `markIsQuantity` in `server/db.ts` (A's SQL).
Applied where a mark becomes a number: `stampCountsForBid` (bid lines),
`countStampsByGroup` ("Send N", the count list), `getStampsForBid`
(materials list, export, drops), and `groupStamps` (pure; `StampRecord.status`
is REQUIRED so no mapping can drop it). `statusSplitByGroup` is the one
display-only count and says so. Tests: `server/markStatusPricing.test.ts`
(red with either half of the rule removed), `client/src/lib/pinLooks.test.ts`,
and A's `server/markStatusQuantities.test.ts`.

## Open

1. **Owner: what do REMOVE and RELOCATE cost?** Today neither is priced
   (neither buys a device) and the card says "labor not on the bid".
   Recommendation in todo.md: a labor line per status per count.
2. **Owner: a run ENDING on an existing mark** still prices its own drop
   (a run end claims a mark; not a mark count, so the rule does not reach
   it). New conduit to an existing device can be real work. todo.md.
3. **Track A: the step-3 fold** of Track C's "… - EXISTING TO REMAIN" twin
   counts (`shared/existingToRemain.ts`) into `status`. Until then those
   twins still PRICE AS NEW if sent — the one remaining way an existing
   device reaches a bid.
4. **"Placing as" while counting** — a New / Existing… choice in the count
   pill so a run of existing devices is placed as existing. The server side
   exists (`drop` takes `status`); only the control is missing.
5. **The look editor on the Legend tab and in the assembly editor.** It
   opens from the count card only; pin plan § 6 wants the one editor from
   all three places.

Also still open from step 1 of the pin plan (todo.md): ring around the
symbol at reading zoom, faint marks, the CSV "Pin" column, step 0's
`LETTER_MIN_PX`.

## Exact next step

Start with **open item 4, "placing as"**: it is the only one that needs no
decision and no migration. In `client/src/pages/TakeoffPage.tsx`, add a
sticky `placingStatus` (default new) beside the armed count, shown in the
counting pill; pass it as `status` in the `dropStamps` mutation and on the
pending marks (so they draw right before the reply). Test that a drop with
`status: "existing"` is not counted (extend `server/markStatusPricing.test.ts`,
which already places existing marks this way), then look at it on screen at
laptop and tablet widths.

Fixture for screen checks: bid "Sheet numbers check" (1728350, user 1),
sheet E-200 (234209, 1/8" scale): four duplex marks are new / existing /
remove / relocate, and the switch count has a chosen look (orange hexagon
"SW"). The `deviceAudit.mts` helpers (`openAt`, `gotoRoute`) drive it; a probe
script must live in `scripts/` to resolve playwright-core.
