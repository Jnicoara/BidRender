# Status view, demo sheets, and scope per line — PLAN ONLY, 2026-10-10

**Track C. Nothing built, no migration written.** Three pieces, in build
order. Each says what already exists (searched 2026-10-10, CLAUDE.md
§ "Where decisions live"), what is new, which bid numbers it can move, and
which migrations it needs (Track A writes and runs every migration).

**Standing rules this follows:**

- **Safe defaults, new options under "More options"** — simple by default,
  one fold, "hide ours, never theirs" (CLAUDE.md § "Customization available,
  but never in the way").
- **Every warning has a fix-it-here button** (`references/never-stuck-plan.md`
  § 1: "a warning that names a problem and then sends the person elsewhere is
  a toll gate").
- **A little high beats low** (owner, 2026-10-09,
  `step-based-labor-plan.md` § 13). Here it means: when the app is unsure,
  it keeps counting a device as new work. It never quietly drops something.
- **Nothing is applied silently.** Every suggestion here is an offer the
  estimator accepts, the same rule `find-all-matching-plan.md` and
  `legend-and-notes-automation-plan.md` already follow ("'maybe existing'
  never sets a status").
- **No AI call the user did not ask for** (CLAUDE.md § AI features). Every
  finder below is plain text search. An AI read, where offered, is a button.

---

## 1. Status view — new / staying / remove / relocate

### What already exists (do not rebuild)

- **The statuses are built.** `takeoff_stamps.status` (0098, 0103) holds
  `new | existing | remove | relocate | unconfirmed`. NULL = new.
  `shared/markStatus.ts` decides pricing in one place: **only a new mark
  counts** toward a bid line, the materials list, the export and the drops.
  `existing` is labelled "Existing to remain" (`markStatus.ts`).
- **Setting it:** "Mark as…" on a selection (`TraceLayer.tsx`) and the
  "Placing as New / Existing" toggle while counting (`TakeoffPage.tsx`).
- **Pin looks:** new is filled; existing is hollow with a solid outline;
  remove is hollow with an X; relocate is filled with an arrow badge
  (`track-b-count-pin-styles-plan.md`).
- **Per count, a split already shows:** the count card reads "12 new · 4
  existing · 1 remove", with an amber note "N remove/relocate — labor not on
  the bid" (`RunsPanel.tsx`, `statusSplitText` / `unpricedStatusNote`).
- **Remove and relocate LABOR is decided but not built:** the owner decided
  on 2026-10-05 (`remove-relocate-labor-plan.md`): one labor line per kind,
  hours on the assembly with a per-bid override, unset hours "not priced",
  relocate labor only. Columns 0110 / 0111 / 0115 exist; **no code reads
  them.**

### What is new

**a. A status toggle on the plan viewer** — four chips: **New · Staying ·
Removed · Relocated**, plus "All" (the default). Picking one DIMS every other
mark on the sheet. It is a view only: nothing is filtered out of a count or
off the bid. "Staying" is the screen word for `existing`; the tooltip says
"existing to remain".

**b. A summary bar for the bid** — "30 new · 8 staying · 12 removed · 4
relocated" across all sheets, with "· 3 unconfirmed" only when there are
any. **Tap a word to highlight those marks** (it sets the toggle), and the
sheet list shows a small count per sheet, so "12 removed" can be found.
Read from the same server split as the count card (`statusSplitByGroup`,
DISPLAY ONLY), summed per bid, so the two can never disagree.

**c. Its warnings, each with a fix-it button:**

| Warning                                                                         | Fix it here                                                                                               |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "12 removed — remove labor not set on 2 items"                                  | "Set remove hours" opens that assembly's remove-hours field inline (needs § 1d)                           |
| "3 unconfirmed — not counted until checked"                                     | "Check them" steps through the 3 marks one by one, with New / Staying / Remove on each                    |
| "A count named '… EXISTING TO REMAIN' is still priced as new" (before A's fold) | "Make these staying" moves its marks to `existing` on its base count (the fold, for one count, on demand) |

**d. Remove / relocate labor (the 2026-10-05 plan) ships WITH the status
view, or right before it.** Otherwise the summary's "12 removed" can only
warn with nothing to fix, which breaks the fix-it rule. The plan already
says what to build. It moves numbers (§ 4).

### A's part — fold "EXISTING TO REMAIN" into mark status

Already planned and not written (`migrations-0098-batch-plan.md` step 3,
`track-a-handoff.md`, `migrations-next-batch.md`):

1. Each mark in a "<name> - EXISTING TO REMAIN" count moves to its base
   count with `status = 'existing'`. The emptied twin count goes, and twin
   assemblies are **retired, not deleted**.
2. **A twin already sent to a bid** must be removed or flagged, never left
   silently pricing. **On a locked bid, the fold moves nothing.** This is the
   owner question still open in `migrations-0098-batch-plan.md` (Q1 below).
3. It is a **meaning** migration (step 3 of three): it runs AFTER the status
   code is live, and it **moves totals on purpose** (twin devices stop
   pricing as new). Measure with `scripts/bidTotals.mts` before and after,
   and list every bid that moved.
4. Then Find all matching's "Count as existing" (`TakeoffPage.tsx`) sets
   `status = 'existing'` instead of making a twin. That is Track C code, in
   the same change.

The status view does NOT wait for the fold. Until it runs, a twin count
shows in the summary as **new**, which is what it prices as, with the
warning above and its one-count fix.

---

## 2. Sheet tags, demo-over-new overlay, "same device?"

### What already exists

- **No sheet-level Demo / New tag.** `bid_pdf_sheets` has no such column.
  Sheet number and title are in `bid_pdf_sheet_identity`.
- **Demolition is already recognised per PLAN REGION:**
  `shared/sheetTitleBlock.ts` recognises DEMOLITION / DEMO in titles;
  `client/src/lib/cadLayers.ts` maps -D / DEMO / RMV layers to demolition and
  -E / EXIST to existing; Find all matching shows a demolition find as "not
  counted" and never takes it in Confirm all (`findMatching.ts`).
- **Overlay:** takeoff-spec V20 level 2 ("show both versions on top of each
  other in two colours") was picked as "after zoom and pan"; D14 (two
  drawings side by side) was "not now". `code-first-ceiling.md` found a real
  old/new pair shared only 15% of its line work.
- **Same device across sheets:** nothing recorded. On the reader test sets,
  the NEW plan and the DEMOLITION plan are usually on the SAME sheet (top and
  bottom), which matters for how much of this is needed (Q5).

### a. Sheet tags on upload

- After an upload, the sheet list offers a tag per sheet: **Demo / New work
  / Both**, pre-filled as a SUGGESTION from the title ("DEMOLITION" → Demo,
  using `sheetTitleBlock`'s existing words) and from CAD layers. The
  estimator confirms the suggestions in one click ("Use these tags") or
  changes any. **Nothing is tagged until confirmed.** Not said is the safe
  default and behaves exactly as today.
- **Colored banner** across the top of the viewer: amber "DEMO SHEET —
  marks placed here default to Remove", blue "NEW WORK", split for "Both".
  No banner when not said.
- **What a tag changes:** only the default of "Placing as" on that sheet
  (Demo → Remove, New → New, Both → asks once per sheet). Every mark can
  still be set to anything. A tag never re-statuses marks already placed,
  except through an offer: "This sheet has 14 marks placed as New. Make them
  Remove?" with a button.
- Tags sit on the sheet's row menu; the upload offer is a one-time panel.
  Neither adds a control to the main toolbar.

### b. Demo-over-new overlay

- On a New-work sheet, **"Show demo marks"** (under "More options" on the
  viewer) draws the paired Demo sheet's REMOVE marks as ghosted outlines over
  this sheet. **Marks only, not the drawing.** Two drawings rarely line up
  (`code-first-ceiling.md`), and marks are cheap to draw.
- **Pairing and alignment:** the estimator picks the Demo sheet once, then
  clicks two matching points on each sheet (two column-grid intersections are
  the usual choice), the same interaction as calibrating a scale. Stored per
  sheet pair. With no alignment, there is no overlay, and the button says
  "Line the two sheets up first" and starts that.
- **When demo and new share ONE sheet** (the common case), no pairing is
  needed: the overlay is simply the Remove marks on the same sheet, which the
  status toggle (§ 1a) already shows. § 2b is only for separate demo sheets.

### c. "Same device?" — staying or relocate instead of double counting

- **The fault it prevents:** a fixture shown on the demo sheet as removed AND
  on the new sheet as new, when it actually stays. Counted that way, it buys
  a new fixture and pays to remove the old one.
- **When:** a New mark is placed (or found) where an aligned Remove mark of
  the SAME item sits, within a tolerance (the existing find-matching match
  distance; Q6). Same sheet or a paired sheet.
- **The offer** (a small card at the mark, never a modal):
  "Same device as the removed one here?"
  - **Staying** — the pair becomes one `existing` mark: the new mark is set
    to existing and linked to the remove mark, which stops counting as a
    removal.
  - **Relocated** — the remove mark is set to `relocate` and the new mark is
    linked to it, so it counts as the relocation (labor only, once the remove /
    relocate labor is built) instead of a new device.
  - **No, both** — keeps both as they are. **This is the default** if the
    card is dismissed (a little high beats low).
- **Never automatic.** A summary line "4 possible same devices" (with "Check
  them" stepping through each) catches the ones dismissed in a hurry.

---

## 3. Scope tags per bid line

### What already exists

- **Scope is bid-level text only:** `scope_notes` (a company library,
  include / exclude) snapshotted into `bid_scope_notes`. Edited in
  `ScopeNotesPanel.tsx`, closed by default. Printed on the proposal as
  "Includes & excludes" ("Included" / "Not included", `ProposalSheet.tsx`).
- **No per-line scope field** on `bid_line_items`.
- **Near neighbours:** `assemblies.laborOnly` (0105, frozen onto the line as
  `snapshotLaborOnly`), and `bid_panels.isExisting` ("already on site,
  nothing to buy").
- **Owner-furnished, decided for the starters:** fixtures and appliances are
  their own line, "so an owner-furnished job deletes one line"
  (`starter-assemblies-plan.md`).
- **Phrase readers:** the plan for status words, NIC and "by others"
  (`legend-and-notes-automation-plan.md`) is not built. OFCI and N.I.C.
  appear nowhere in code.

### a. The tag

Every bid line carries ONE of:

| Tag                             | Prices                                                                                                         | On the proposal                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **We install** (the default)    | as today: material and labor                                                                                   | as today                                             |
| **Owner furnishes, we install** | **labor only**: material drops out and never reads "material not priced" (the `laborOnly` treatment, per line) | "Owner-furnished, installed by us: …" under Included |
| **By others**                   | **never prices**: $0, out of the totals, the materials list and the export, never "not priced"                 | "By others: …" under Not included                    |
| **Excluded**                    | never prices, the same as By others                                                                            | "Excluded: …" under Not included                     |

- The default is **We install** on every line, new and existing. So adding
  the column moves nothing (§ 4).
- The tag is a small chip on the line, opening a 4-item menu. It is set per
  line, or on many lines at once from a selection. The two "never prices"
  tags grey the line out but keep it visible on the bid, so it is not lost.
- **A takeoff-linked line keeps its live quantity** whatever its tag. The tag
  only decides what the quantity is priced at.
- **On a locked bid** the tag is frozen like every other number. Changing it
  needs unlocking, the same as any edit.

### b. The scope summary

A line at the top of the bid's totals: **"48 we install · 6 owner furnishes ·
3 by others · 2 excluded"**. Tap a word to filter the lines to it. The
proposal's "Includes & excludes" gains the tagged lines automatically,
grouped, beside the hand-written scope notes, which stay as they are.

### c. "Who does this?" — prompts for gray areas

- A short, fixed list of items that are often someone else's: light fixtures,
  appliances, low-voltage / data cabling, fire alarm devices, HVAC control
  wiring, EV charger units, permits, trenching / patching / painting. It is
  shipped content, editable, and a shop's own entries are always shown.
- When a bid has a line matching one (by category or name), the scope summary
  shows **"Who does this? — 3 items"**. Each opens a 4-chip answer right
  there. Not answering leaves **We install** (high beats low).
- Shown once per bid; "Don't ask on this bid" hides it. It never blocks
  printing or sending.

### d. Note finder — "by others" and OFCI phrases

- A plain text search over the sheet text already stored at upload
  (`bid_pdf_sheet_text`) for: BY OTHERS · FURNISHED BY OTHERS · BY OWNER ·
  OWNER FURNISHED · OFCI · OFOI · OFOI / CFCI · N.I.C. / NIC / NOT IN
  CONTRACT · BY G.C. · BY DIVISION 23 / 27 / 28 · EXISTING TO REMAIN · E.T.R.
- Results go in a list: sheet, the sentence it sits in, and a "Go to" link.
  Each offers **"Tag matching lines"**, which suggests the lines whose names
  share a word with the sentence. The estimator ticks them; nothing is tagged
  silently.
- Free (no AI). An optional "Read this note" AI button is the closed-list
  meaning call the notes plan already priced (about $0.0007 a note). It is a
  button, never automatic.
- It lives under "More options" on the bid's scope summary, and on the plan
  viewer's notes panel when that is built.

---

## 4. Which pieces change bid numbers

| Piece                               | Moves a number?                                                                                    | When                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1a/1b status toggle, summary bar    | **No.** View only                                                                                  | —                                                                         |
| 1d remove / relocate labor          | **Yes, up:** remove and relocate marks gain labor lines, "not priced" until hours are set          | Only on bids with remove or relocate marks; existing lines stay frozen    |
| A's twin fold                       | **Yes, down, on purpose:** twin "existing" devices stop pricing as new                             | Once, after the status code is live. Locked bids never move               |
| 2a sheet tags                       | No by itself. A Demo default makes NEW marks there start as Remove                                 | Only on marks placed after the tag; old marks only on "Make them Remove?" |
| 2b overlay                          | No. View only                                                                                      | —                                                                         |
| 2c "same device?"                   | **Yes, down, only when accepted:** Staying / Relocated replaces a new device                       | Never by default                                                          |
| 3a scope tags                       | **Only when a tag is changed:** Owner furnishes drops material; By others / Excluded drop the line | Adding the column: no (all "We install")                                  |
| 3b–3d summary, prompts, note finder | No. They offer tags, they do not set them                                                          | —                                                                         |

**Measured, not asserted, at each step:** `scripts/bidTotals.mts` before and
after every migration and every deploy, and every moved total explained.

## 5. Migrations (Track A writes and runs every one)

| #   | For      | What                                                                                                                                                                   | Kind                                        |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| M1  | 1 (fold) | twin marks → base count, `status = 'existing'`; twin counts removed; twin assemblies retired                                                                           | **meaning, step 3**: after the code is live |
| —   | 1d       | none: 0110 / 0111 / 0115 already exist                                                                                                                                 | —                                           |
| M2  | 2a       | `bid_pdf_sheets.workTag enum('demo','new','both')` NULL (= not said), and `workTagSuggested` (same enum, NULL)                                                         | additive, step 1                            |
| M3  | 2b       | `bid_sheet_alignments` (bidId, sheetId, pairedSheetId, two point pairs, createdAt)                                                                                     | additive, step 1                            |
| M4  | 2c       | `takeoff_stamps.sameAsStampId` int NULL → `takeoff_stamps.id` (on delete set null)                                                                                     | additive, step 1                            |
| M5  | 3a       | `bid_line_items.scopeTag enum('install','ofci','by_others','excluded')` **NULL = We install**, no default (CLAUDE.md: NULL is "not said", read as the old meaning)     | additive, step 1                            |
| M6  | 3c       | `scope_prompts` (company library: name, match words, isActive, userId/baselineId — the materials pattern) and `bid_scope_answers` (bidId, promptId, answer, dismissed) | additive, step 1                            |

M2–M6 are additive. The code reads NULL as today's behaviour, so each
can go ahead of its code. M1 is the only meaning migration.

## 6. Build order

1. **1d remove / relocate labor** (Track C code; columns exist). It moves
   numbers on bids with remove / relocate marks only. Measure first.
2. **1a–1c status toggle and summary bar.** No numbers move.
3. **A's M1 fold**, after 1–2 are live (step 3).
4. **3a scope tags + 3b summary** (M5). Highest value per line of code: the
   proposal finally says who does what.
5. **3c prompts + 3d note finder** (M6).
6. **2a sheet tags** (M2), then **2c "same device?"** on the same sheet, then
   **2b overlay + pairing** (M3, M4) only if the owner wants separate demo
   sheets handled (Q5).

## 7. Questions for the owner — each with a suggested answer

1. **A twin "EXISTING TO REMAIN" count already sent to an UNLOCKED bid: when
   the fold runs, remove that line or flag it?**
   _Suggested:_ flag it, with a "Remove this line" fix-it button on the
   line. Removing it silently would move a number nobody looked at, and on a
   locked bid nothing moves at all.
2. **Screen word for `existing`: "Staying" or "Existing to remain"?**
   _Suggested:_ "Staying" on the chips and the summary (short), with
   "existing to remain" in the tooltip and on the proposal (the trade's
   term).
3. **Ship remove / relocate labor before or with the status view?**
   _Suggested:_ before. The summary's "12 removed" must have a fix-it
   ("Set remove hours"), and that needs the labor code.
4. **On a Demo-tagged sheet, should "Placing as" default to Remove?**
   _Suggested:_ yes, with the amber banner saying so. Demo-sheet devices are
   removals; pricing them as new is the costlier mistake. The tag itself is
   only ever applied after a confirmation.
5. **Separate demo sheets: needed now, or only demo and new on one sheet?**
   _Suggested:_ one sheet first (2a + 2c with no pairing). Build 2b's pairing
   and overlay only when a real job arrives with separate demo sheets, and
   use it as the test set.
6. **"Same device?" distance: how close counts as the same spot?**
   _Suggested:_ 2 ft on the drawing, at the sheet's scale, and the same item.
   Wider asks too often; the summary line catches misses.
7. **Should "Owner furnishes, we install" keep the material line visible at
   $0, or hide it?**
   _Suggested:_ keep it visible, greyed, with "owner furnished" in place of
   the price. The estimator can see what was taken out, and the materials
   list says "owner furnished" rather than leaving it off.
8. **Do "By others" and "Excluded" need to be separate tags?**
   _Suggested:_ yes. They price the same ($0) but read differently on the
   proposal: "By others" names a party, "Excluded" protects the contractor.
   Both protect against "you never said".
9. **The "Who does this?" list: ship the eight suggested items?**
   _Suggested:_ yes, as editable content in the seed, and the owner trims or
   adds before it ships.
10. **Should a "By others" / "Excluded" line still count toward the
    materials list and the drops?**
    _Suggested:_ no to both. Not ours to buy or wire. The line stays on the
    bid, greyed, so it can be switched back.
