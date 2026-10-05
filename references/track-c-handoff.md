# Track C — handoff, 2026-10-05

Written for a restart. Worktree `C:\dev\BidPhase-C`, branch `track-c`.
At the time of writing, track-c and local-dev were the same commit, everything
was committed and pushed, and `main` was untouched (`0af50a6`). C's databases
`bidrender_local_c` and `bidrender_test_c` have all 105 migrations (through
0104). If `git log origin/local-dev` or `scripts/schemaDrift.mts` says
otherwise when you read this, stop and find out why before going on — either
this file is stale or the state moved.

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
- **Look-alike warning** (plan § 4 point 2, done 2026-10-05). "Yes, another
  look" first runs the look through Find all matching on its own sheet. If it
  lands on marks counted as another item, `captureSymbol` saves nothing and
  returns them, and the card asks "This look also matches N marks counted as
  X on this sheet. Add it anyway?" with Cancel focused. On a scan (or if the
  search fails) it saves and the message says it could not be compared
  (`lookAlikeCheck`). Seen on screen on Weld 1 E-200 (vector) and Old
  Blueridge E1.01 (scan).

## Not built yet

1. **The rest of plan § 4.** Point 1 (the device words differ from the item's
   other looks: "Your other look has 'GF' beside it") and the second half of
   point 2 (another item's LOOK on this set finds the same spots, not just
   its marks). Also "from a new look" tagging so Confirm all skips a new
   look's finds for the session (§ 4, § 8 test 7). The warning runs only on
   an ADDED look, not on a new item's first look.
2. **"Find on this sheet" from one look** (plan § 5), the third action on a
   look.
3. **The per-row choice in whole-legend capture** (`LegendCapture.tsx`): a
   matching name keeps "left as it is", which is the decided default. The
   choice to make it another look is missing.
4. **Sending looks to the Reader** (plan § 3): every look under the item's
   one label, the set's own first, up to the cap. Measure first with
   `scripts/readerAccuracy.mts` methods (b)/(d), 1 look against 3.
5. **Size-aware matching across plan sets.** The line matcher compares exact
   sizes, so a look from a set drawn at another size finds nothing. Seen on
   screen: a UNCC duplex look found 0 on Weld 1 E-200. Candidate:
   `scaleTemplate` (already in `findMatching.ts`, used by the sheet check)
   at a few sizes, with every such find staying a suggestion under the
   per-set rule.

## The exact next step

**Item 1's "from a new look" tag** (plan § 8 test 7): a look added this
session should not have its finds swept in by Confirm all. It is the
remaining guard against a wrong look that the person said "Add anyway" to.
Pure, in `client/src/lib/findMatchingSession.ts` (`clearOpen`), using the
`foundByLooks` ids that `mergeLookResults` now records.

## Migrations Track A would need

**None for anything above.** Everything listed runs on existing tables.
Requests that already stand, unchanged:

- `bid_pdf_legend_entries.lookId` (nullable, set null): only if A builds its
  per-set legend plan. It would also become a third way for a set to confirm
  a look (`shared/symbolLooks.ts`, `lookConfirmsSet`).
- The decision log for scan finds (`scanned-plans-plan.md` § 5), for a future
  detector. Not urgent.
- A unique key on `symbol_links (userId, lookupKey)` (A's R.6). "One item per
  name" is still enforced only in code.
